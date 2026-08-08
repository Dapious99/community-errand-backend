import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ConcernsService } from "./concerns.service";
import {
  ErrandConcern,
  ErrandConcernReopenedBy,
  ErrandConcernStatus,
} from "../errands/entities/errand-concern.entity";
import { Errand, ErrandStatus } from "../errands/entities/errand.entity";
import { ErrandApplication } from "../errands/entities/errand-application.entity";
import { UsersService } from "../users/users.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PaymentsService } from "../payments/payments.service";
import { SettingsService } from "../settings/settings.service";

describe("ConcernsService", () => {
  let service: ConcernsService;
  let concernsRepo: any;
  let errandsRepo: any;
  let applicationsRepo: any;
  let usersService: jest.Mocked<UsersService>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let paymentsService: jest.Mocked<PaymentsService>;
  let settingsService: jest.Mocked<SettingsService>;
  let updateExecute: jest.Mock;
  let queryBuilder: any;

  beforeEach(async () => {
    updateExecute = jest.fn().mockResolvedValue({ affected: 1 });
    queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: updateExecute,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConcernsService,
        {
          provide: getRepositoryToken(ErrandConcern),
          useValue: {
            create: jest.fn((data) => ({ id: "concern-1", ...data })),
            save: jest.fn((data) => Promise.resolve({ id: "concern-1", ...data })),
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Errand),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn().mockResolvedValue([]),
            createQueryBuilder: jest.fn(() => queryBuilder),
          },
        },
        {
          provide: getRepositoryToken(ErrandApplication),
          useValue: { update: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: UsersService,
          useValue: { recordErrandFailure: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: NotificationsService,
          useValue: { sendToUsers: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: PaymentsService,
          useValue: { forfeitErrandFunds: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: SettingsService,
          useValue: {
            get: jest.fn((key: string, fallback: any) =>
              Promise.resolve(fallback)
            ),
          },
        },
      ],
    }).compile();

    service = module.get(ConcernsService);
    concernsRepo = module.get(getRepositoryToken(ErrandConcern));
    errandsRepo = module.get(getRepositoryToken(Errand));
    applicationsRepo = module.get(getRepositoryToken(ErrandApplication));
    usersService = module.get(UsersService);
    notificationsService = module.get(NotificationsService);
    paymentsService = module.get(PaymentsService);
    settingsService = module.get(SettingsService);
  });

  const acceptedErrand = {
    id: "errand-1",
    title: "Buy groceries",
    requesterId: "requester-1",
    runnerId: "runner-1",
    status: ErrandStatus.ACCEPTED,
  };

  describe("raise", () => {
    it("throws when the errand doesn't exist", async () => {
      errandsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.raise("errand-1", "requester-1", "Runner gone silent")
      ).rejects.toThrow(NotFoundException);
    });

    it("throws when the caller isn't the requester", async () => {
      errandsRepo.findOne.mockResolvedValue(acceptedErrand);

      await expect(
        service.raise("errand-1", "someone-else", "Runner gone silent")
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws when the errand hasn't been accepted yet", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...acceptedErrand, status: ErrandStatus.OPEN });

      await expect(
        service.raise("errand-1", "requester-1", "Runner gone silent")
      ).rejects.toThrow(BadRequestException);
    });

    it("throws when there's already an active concern", async () => {
      errandsRepo.findOne.mockResolvedValue(acceptedErrand);
      concernsRepo.findOne.mockResolvedValue({ id: "existing-concern" });

      await expect(
        service.raise("errand-1", "requester-1", "Runner gone silent")
      ).rejects.toThrow(ConflictException);
    });

    it("creates an OPEN concern and notifies the runner", async () => {
      errandsRepo.findOne.mockResolvedValue(acceptedErrand);
      concernsRepo.findOne.mockResolvedValue(null);

      const result = await service.raise("errand-1", "requester-1", "Runner gone silent");

      expect(result.status).toBe(ErrandConcernStatus.OPEN);
      expect(notificationsService.sendToUsers).toHaveBeenCalledWith(
        ["runner-1"],
        expect.any(String),
        expect.stringContaining("within 10 minutes"),
        expect.objectContaining({ errandId: "errand-1" })
      );
    });

    it("reflects an admin-configured ack timeout in the runner notification copy", async () => {
      settingsService.get.mockResolvedValueOnce(3);
      errandsRepo.findOne.mockResolvedValue(acceptedErrand);
      concernsRepo.findOne.mockResolvedValue(null);

      await service.raise("errand-1", "requester-1", "Runner gone silent");

      expect(notificationsService.sendToUsers).toHaveBeenCalledWith(
        ["runner-1"],
        expect.any(String),
        expect.stringContaining("within 3 minutes"),
        expect.any(Object)
      );
    });
  });

  describe("acknowledge", () => {
    const openConcern = {
      id: "concern-1",
      errandId: "errand-1",
      raisedByUserId: "requester-1",
      status: ErrandConcernStatus.OPEN,
    };

    it("throws when the caller isn't the assigned runner", async () => {
      concernsRepo.findOne.mockResolvedValue(openConcern);
      errandsRepo.findOne.mockResolvedValue(acceptedErrand);

      await expect(
        service.acknowledge("concern-1", "someone-else", "still working on it")
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws when the concern isn't OPEN", async () => {
      concernsRepo.findOne.mockResolvedValue({
        ...openConcern,
        status: ErrandConcernStatus.ACKNOWLEDGED,
      });
      errandsRepo.findOne.mockResolvedValue(acceptedErrand);

      await expect(
        service.acknowledge("concern-1", "runner-1")
      ).rejects.toThrow(BadRequestException);
    });

    it("marks the concern ACKNOWLEDGED and notifies the requester", async () => {
      concernsRepo.findOne.mockResolvedValue({ ...openConcern });
      errandsRepo.findOne.mockResolvedValue(acceptedErrand);

      const result = await service.acknowledge("concern-1", "runner-1", "Almost there");

      expect(result.status).toBe(ErrandConcernStatus.ACKNOWLEDGED);
      expect(result.runnerReply).toBe("Almost there");
      expect(notificationsService.sendToUsers).toHaveBeenCalledWith(
        ["requester-1"],
        expect.any(String),
        expect.stringContaining("Almost there"),
        expect.any(Object)
      );
    });
  });

  describe("release", () => {
    const openConcern = {
      id: "concern-1",
      errandId: "errand-1",
      raisedByUserId: "requester-1",
      status: ErrandConcernStatus.OPEN,
    };

    it("throws when the caller isn't the assigned runner", async () => {
      concernsRepo.findOne.mockResolvedValue(openConcern);
      errandsRepo.findOne.mockResolvedValue(acceptedErrand);

      await expect(service.release("concern-1", "someone-else")).rejects.toThrow(
        ForbiddenException
      );
    });

    it("reopens the errand, declines applications, and strikes the runner", async () => {
      concernsRepo.findOne
        .mockResolvedValueOnce({ ...openConcern })
        .mockResolvedValueOnce({ ...openConcern, status: ErrandConcernStatus.REOPENED });
      errandsRepo.findOne.mockResolvedValue(acceptedErrand);

      await service.release("concern-1", "runner-1");

      expect(queryBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: ErrandStatus.OPEN, runnerId: null })
      );
      expect(applicationsRepo.update).toHaveBeenCalled();
      expect(usersService.recordErrandFailure).toHaveBeenCalledWith("runner-1");
      expect(notificationsService.sendToUsers).toHaveBeenCalledWith(
        ["requester-1"],
        expect.any(String),
        expect.any(String),
        expect.any(Object)
      );
    });

    it("just resolves the concern without a strike if the errand already moved on", async () => {
      updateExecute.mockResolvedValue({ affected: 0 });
      concernsRepo.findOne.mockResolvedValue({ ...openConcern });
      errandsRepo.findOne.mockResolvedValue(acceptedErrand);

      await service.release("concern-1", "runner-1");

      expect(usersService.recordErrandFailure).not.toHaveBeenCalled();
      expect(concernsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ErrandConcernStatus.RESOLVED })
      );
    });
  });

  describe("processUnansweredConcerns", () => {
    it("reopens every stale OPEN concern it finds", async () => {
      const staleConcern = {
        id: "concern-1",
        errandId: "errand-1",
        raisedByUserId: "requester-1",
        status: ErrandConcernStatus.OPEN,
      };
      concernsRepo.find.mockResolvedValue([staleConcern]);
      errandsRepo.findOne.mockResolvedValue(acceptedErrand);

      const result = await service.processUnansweredConcerns();

      expect(result.reopened).toBe(1);
      expect(usersService.recordErrandFailure).toHaveBeenCalledWith("runner-1");
      expect(concernsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ErrandConcernStatus.REOPENED,
          reopenedBy: ErrandConcernReopenedBy.SYSTEM,
        })
      );
    });
  });

  describe("processTimedErrandDeadlines", () => {
    it("cancels, forfeits funds, and strikes the runner for each overdue errand", async () => {
      errandsRepo.find.mockResolvedValue([
        { ...acceptedErrand, timeWindowEnd: new Date(Date.now() - 60_000) },
      ]);

      const result = await service.processTimedErrandDeadlines();

      expect(result.forfeited).toBe(1);
      expect(queryBuilder.set).toHaveBeenCalledWith({ status: ErrandStatus.CANCELLED });
      expect(paymentsService.forfeitErrandFunds).toHaveBeenCalledWith(
        "errand-1",
        expect.any(String)
      );
      expect(usersService.recordErrandFailure).toHaveBeenCalledWith("runner-1");
      expect(notificationsService.sendToUsers).toHaveBeenCalledWith(
        ["requester-1"],
        expect.any(String),
        expect.any(String),
        expect.any(Object)
      );
    });

    it("skips an errand that a concurrent completion/reopen already moved on", async () => {
      updateExecute.mockResolvedValue({ affected: 0 });
      errandsRepo.find.mockResolvedValue([
        { ...acceptedErrand, timeWindowEnd: new Date(Date.now() - 60_000) },
      ]);

      const result = await service.processTimedErrandDeadlines();

      expect(result.forfeited).toBe(0);
      expect(paymentsService.forfeitErrandFunds).not.toHaveBeenCalled();
    });
  });
});
