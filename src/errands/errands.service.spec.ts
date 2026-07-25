import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ErrandsService } from "./errands.service";
import { Errand, ErrandStatus } from "./entities/errand.entity";
import { Location } from "./entities/location.entity";
import { MediaAttachment } from "./entities/media-attachment.entity";
import { UserRole } from "../users/entities/user.entity";
import { PaymentsService } from "../payments/payments.service";

describe("ErrandsService", () => {
  let service: ErrandsService;
  let errandsRepo: any;
  let paymentsService: jest.Mocked<PaymentsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ErrandsService,
        {
          provide: getRepositoryToken(Errand),
          useValue: {
            create: jest.fn((data) => data),
            save: jest.fn((data) => Promise.resolve({ ...data })),
            findOne: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        { provide: getRepositoryToken(Location), useValue: {} },
        { provide: getRepositoryToken(MediaAttachment), useValue: {} },
        {
          provide: PaymentsService,
          useValue: {
            processPayout: jest.fn().mockResolvedValue(null),
            processRefund: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get(ErrandsService);
    errandsRepo = module.get(getRepositoryToken(Errand));
    paymentsService = module.get(PaymentsService);
  });

  describe("acceptErrand", () => {
    const openErrand = {
      id: "errand-1",
      status: ErrandStatus.OPEN,
      requesterId: "requester-1",
    };

    it("rejects requesters trying to accept their own errand", async () => {
      errandsRepo.findOne.mockResolvedValue(openErrand);

      await expect(
        service.acceptErrand("errand-1", "requester-1", UserRole.BOTH)
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects users with the REQUESTER-only role", async () => {
      errandsRepo.findOne.mockResolvedValue(openErrand);

      await expect(
        service.acceptErrand("errand-1", "runner-1", UserRole.REQUESTER)
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects accepting an errand that is not OPEN", async () => {
      errandsRepo.findOne.mockResolvedValue({
        ...openErrand,
        status: ErrandStatus.ACCEPTED,
      });

      await expect(
        service.acceptErrand("errand-1", "runner-1", UserRole.RUNNER)
      ).rejects.toThrow(BadRequestException);
    });

    it("assigns the runner and moves the errand to ACCEPTED", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...openErrand });

      const result = await service.acceptErrand(
        "errand-1",
        "runner-1",
        UserRole.RUNNER
      );

      expect(result.status).toBe(ErrandStatus.ACCEPTED);
      expect(result.runnerId).toBe("runner-1");
    });
  });

  describe("updateStatus", () => {
    const inProgressErrand = {
      id: "errand-1",
      status: ErrandStatus.IN_PROGRESS,
      requesterId: "requester-1",
      runnerId: "runner-1",
    };

    it("rejects users who are not part of the errand", async () => {
      errandsRepo.findOne.mockResolvedValue(inProgressErrand);

      await expect(
        service.updateStatus(
          "errand-1",
          { status: ErrandStatus.COMPLETED },
          "stranger"
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects completing an errand that is not IN_PROGRESS", async () => {
      errandsRepo.findOne.mockResolvedValue({
        ...inProgressErrand,
        status: ErrandStatus.ACCEPTED,
      });

      await expect(
        service.updateStatus(
          "errand-1",
          { status: ErrandStatus.COMPLETED },
          "runner-1"
        )
      ).rejects.toThrow(BadRequestException);
    });

    it("marks the errand COMPLETED and triggers a payout", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...inProgressErrand });

      const result = await service.updateStatus(
        "errand-1",
        { status: ErrandStatus.COMPLETED },
        "runner-1"
      );

      expect(result.status).toBe(ErrandStatus.COMPLETED);
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(paymentsService.processPayout).toHaveBeenCalledWith("errand-1");
    });

    it("does not fail the request if payout processing throws", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...inProgressErrand });
      paymentsService.processPayout.mockRejectedValue(
        new Error("paystack down")
      );

      const result = await service.updateStatus(
        "errand-1",
        { status: ErrandStatus.COMPLETED },
        "runner-1"
      );

      expect(result.status).toBe(ErrandStatus.COMPLETED);
    });
  });

  describe("cancel", () => {
    it("rejects cancellation from anyone but the requester", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        status: ErrandStatus.OPEN,
        requesterId: "requester-1",
      });

      await expect(service.cancel("errand-1", "runner-1")).rejects.toThrow(
        ForbiddenException
      );
    });

    it("rejects cancelling an already-completed errand", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        status: ErrandStatus.COMPLETED,
        requesterId: "requester-1",
      });

      await expect(service.cancel("errand-1", "requester-1")).rejects.toThrow(
        BadRequestException
      );
    });

    it("cancels the errand and triggers a refund", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        status: ErrandStatus.ACCEPTED,
        requesterId: "requester-1",
      });

      await service.cancel("errand-1", "requester-1");

      expect(errandsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ErrandStatus.CANCELLED })
      );
      expect(paymentsService.processRefund).toHaveBeenCalledWith("errand-1");
    });
  });
});
