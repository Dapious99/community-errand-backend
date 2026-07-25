import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { DataSource } from "typeorm";
import { RatingsService } from "./ratings.service";
import { Rating } from "./entities/rating.entity";
import { Errand, ErrandStatus } from "../errands/entities/errand.entity";
import { User } from "../users/entities/user.entity";

describe("RatingsService", () => {
  let service: RatingsService;
  let ratingsRepo: any;
  let errandsRepo: any;
  let usersRepo: any;

  const completedErrand = {
    id: "errand-1",
    status: ErrandStatus.COMPLETED,
    requesterId: "requester-1",
    runnerId: "runner-1",
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatingsService,
        {
          provide: getRepositoryToken(Rating),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn((data) => data),
            save: jest.fn((data) =>
              Promise.resolve({ id: "rating-1", ...data })
            ),
          },
        },
        {
          provide: getRepositoryToken(Errand),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { update: jest.fn() },
        },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get(RatingsService);
    ratingsRepo = module.get(getRepositoryToken(Rating));
    errandsRepo = module.get(getRepositoryToken(Errand));
    usersRepo = module.get(getRepositoryToken(User));
  });

  describe("create", () => {
    it("throws NotFoundException when the errand does not exist", async () => {
      errandsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create(
          { errandId: "missing", toUserId: "runner-1", rating: 5 },
          "requester-1"
        )
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects rating an errand that is not yet completed", async () => {
      errandsRepo.findOne.mockResolvedValue({
        ...completedErrand,
        status: ErrandStatus.IN_PROGRESS,
      });

      await expect(
        service.create(
          { errandId: "errand-1", toUserId: "runner-1", rating: 5 },
          "requester-1"
        )
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects raters who are not part of the errand", async () => {
      errandsRepo.findOne.mockResolvedValue(completedErrand);

      await expect(
        service.create(
          { errandId: "errand-1", toUserId: "runner-1", rating: 5 },
          "some-other-user"
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects self-rating", async () => {
      errandsRepo.findOne.mockResolvedValue(completedErrand);

      await expect(
        service.create(
          { errandId: "errand-1", toUserId: "requester-1", rating: 5 },
          "requester-1"
        )
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects a duplicate rating for the same errand", async () => {
      errandsRepo.findOne.mockResolvedValue(completedErrand);
      ratingsRepo.findOne.mockResolvedValue({ id: "existing-rating" });

      await expect(
        service.create(
          { errandId: "errand-1", toUserId: "runner-1", rating: 5 },
          "requester-1"
        )
      ).rejects.toThrow(BadRequestException);
    });

    it("saves a valid rating and updates the recipient average", async () => {
      errandsRepo.findOne.mockResolvedValue(completedErrand);
      ratingsRepo.findOne
        .mockResolvedValueOnce(null) // duplicate check inside create()
        .mockResolvedValueOnce(undefined);
      ratingsRepo.find.mockResolvedValue([{ rating: 5 }, { rating: 3 }]);

      const result = await service.create(
        { errandId: "errand-1", toUserId: "runner-1", rating: 5 },
        "requester-1"
      );

      expect(result).toMatchObject({
        errandId: "errand-1",
        toUserId: "runner-1",
        rating: 5,
      });
      expect(usersRepo.update).toHaveBeenCalledWith("runner-1", {
        ratingAvg: 4,
      });
    });
  });

  describe("getStats", () => {
    it("returns zeroed stats when the user has no ratings", async () => {
      ratingsRepo.find.mockResolvedValue([]);

      const stats = await service.getStats("user-1");

      expect(stats.averageRating).toBe(0);
      expect(stats.totalRatings).toBe(0);
    });

    it("computes the average and distribution across ratings", async () => {
      ratingsRepo.find.mockResolvedValue([
        { rating: 5 },
        { rating: 5 },
        { rating: 1 },
      ]);

      const stats = await service.getStats("user-1");

      expect(stats.totalRatings).toBe(3);
      expect(stats.averageRating).toBeCloseTo(3.67, 2);
      expect(stats.ratingDistribution[5]).toBe(2);
      expect(stats.ratingDistribution[1]).toBe(1);
    });
  });
});
