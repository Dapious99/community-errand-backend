import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import axios from "axios";
import { NotificationsService } from "./notifications.service";
import { PushToken } from "./entities/push-token.entity";
import { UsersService } from "../users/users.service";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("NotificationsService", () => {
  let service: NotificationsService;
  let repo: any;
  let usersService: jest.Mocked<UsersService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getRepositoryToken(PushToken),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn((data) => data),
            save: jest.fn((data) => Promise.resolve(data)),
            find: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: { findNearbyTopRatedRunners: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(NotificationsService);
    repo = module.get(getRepositoryToken(PushToken));
    usersService = module.get(UsersService);
  });

  describe("registerToken", () => {
    it("creates a new token when none exists for this device", async () => {
      repo.findOne.mockResolvedValue(null);

      await service.registerToken(
        "user-1",
        "device-1",
        "ExponentPushToken[abc]"
      );

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          deviceId: "device-1",
          expoPushToken: "ExponentPushToken[abc]",
        })
      );
    });

    it("updates the existing token in place", async () => {
      const existing = {
        userId: "user-1",
        deviceId: "device-1",
        expoPushToken: "old",
      };
      repo.findOne.mockResolvedValue(existing);

      await service.registerToken("user-1", "device-1", "new-token");

      expect(existing.expoPushToken).toBe("new-token");
      expect(repo.save).toHaveBeenCalledWith(existing);
    });
  });

  describe("sendToUsers", () => {
    it("does nothing when there are no user ids", async () => {
      await service.sendToUsers([], "Title", "Body");

      expect(repo.find).not.toHaveBeenCalled();
    });

    it("filters out malformed tokens before sending", async () => {
      repo.find.mockResolvedValue([
        { userId: "user-1", expoPushToken: "ExponentPushToken[valid]" },
        { userId: "user-2", expoPushToken: "not-a-real-token" },
      ]);
      mockedAxios.post.mockResolvedValue({ data: {} });

      await service.sendToUsers(["user-1", "user-2"], "Title", "Body");

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const [, payload] = mockedAxios.post.mock.calls[0];
      expect(payload).toEqual([
        {
          to: "ExponentPushToken[valid]",
          title: "Title",
          body: "Body",
          data: undefined,
        },
      ]);
    });

    it("does not throw when the Expo push API fails", async () => {
      repo.find.mockResolvedValue([
        { userId: "user-1", expoPushToken: "ExponentPushToken[valid]" },
      ]);
      mockedAxios.post.mockRejectedValue(new Error("network error"));

      await expect(
        service.sendToUsers(["user-1"], "Title", "Body")
      ).resolves.toBeUndefined();
    });
  });

  describe("notifyNearbyTopRatedRunners", () => {
    it("does nothing when no runners are nearby", async () => {
      usersService.findNearbyTopRatedRunners.mockResolvedValue([]);

      await service.notifyNearbyTopRatedRunners({
        latitude: 6.5,
        longitude: 3.4,
        title: "New boosted errand nearby!",
        body: "Buy groceries",
      });

      expect(repo.find).not.toHaveBeenCalled();
    });

    it("sends to every nearby runner found", async () => {
      usersService.findNearbyTopRatedRunners.mockResolvedValue([
        { id: "runner-1" } as any,
        { id: "runner-2" } as any,
      ]);
      repo.find.mockResolvedValue([
        { userId: "runner-1", expoPushToken: "ExponentPushToken[a]" },
        { userId: "runner-2", expoPushToken: "ExponentPushToken[b]" },
      ]);
      mockedAxios.post.mockResolvedValue({ data: {} });

      await service.notifyNearbyTopRatedRunners({
        latitude: 6.5,
        longitude: 3.4,
        title: "New boosted errand nearby!",
        body: "Buy groceries",
      });

      expect(usersService.findNearbyTopRatedRunners).toHaveBeenCalledWith(
        6.5,
        3.4,
        10,
        20
      );
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });
});
