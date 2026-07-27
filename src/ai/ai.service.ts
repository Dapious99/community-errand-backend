import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import {
  ErrandCategory,
  UrgencyLevel,
} from "../errands/entities/errand.entity";

const MODEL = "claude-haiku-4-5";

interface PriceEstimateInput {
  category: ErrandCategory;
  description: string;
  pickupLabel?: string;
  dropoffLabel?: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiKey?: string;
  private client?: Anthropic;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>("ANTHROPIC_API_KEY");
    if (!this.apiKey) {
      this.logger.warn(
        "ANTHROPIC_API_KEY is not set - AI features (Magic Post, price estimates, boost title rewrite, smart replies) will fail until it's configured."
      );
    }
  }

  private getClient(): Anthropic {
    if (!this.apiKey) {
      throw new BadRequestException(
        "AI features aren't configured yet (missing ANTHROPIC_API_KEY)."
      );
    }
    this.client ??= new Anthropic({ apiKey: this.apiKey });
    return this.client;
  }

  /**
   * Forces a tool call with `strict: true` so `tool_use.input` is guaranteed
   * to validate against the schema - no prompt-and-parse JSON guessing.
   * Haiku 4.5 doesn't support `thinking`/`effort` (both error), which is fine
   * here: these are short, single-turn extraction tasks, not deep reasoning.
   */
  private async callTool<T>(
    toolName: string,
    description: string,
    schema: Record<string, any>,
    systemPrompt: string,
    userContent: string
  ): Promise<T> {
    try {
      const response = await this.getClient().messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        tools: [
          {
            name: toolName,
            description,
            strict: true,
            input_schema: schema,
          } as any,
        ],
        tool_choice: { type: "tool", name: toolName },
        messages: [{ role: "user", content: userContent }],
      });

      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      if (!toolUse) {
        throw new Error("Model did not return a structured result");
      }

      return toolUse.input as T;
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`AI request failed (${toolName}): ${error.message}`);
      throw new BadRequestException("AI request failed. Please try again.");
    }
  }

  /**
   * Feature A ("AI Magic Post"): turns free-form text into a draft the user
   * reviews/edits before actually creating the errand - never creates it
   * directly.
   */
  async parseErrandFromText(text: string): Promise<{
    title: string;
    description: string;
    category: ErrandCategory;
    urgency: UrgencyLevel;
    pickupLabel: string;
    recommendedPrice: number;
  }> {
    return this.callTool(
      "extract_errand_draft",
      "Extract a structured errand draft from free-form user text describing an errand they need done.",
      {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "A short, clear title for the errand",
          },
          description: {
            type: "string",
            description: "A fuller description of what needs to be done",
          },
          category: { type: "string", enum: Object.values(ErrandCategory) },
          urgency: { type: "string", enum: Object.values(UrgencyLevel) },
          pickupLabel: {
            type: "string",
            description: "The pickup location mentioned, or a reasonable guess",
          },
          recommendedPrice: {
            type: "number",
            description: "A recommended price in Nigerian Naira (NGN)",
          },
        },
        required: [
          "title",
          "description",
          "category",
          "urgency",
          "pickupLabel",
          "recommendedPrice",
        ],
        additionalProperties: false,
      },
      "You turn a user's casual description of an errand into a structured draft. Infer sensible values for anything not explicitly stated.",
      text
    );
  }

  /** Feature B: a suggested market-rate price range for the create-errand UI. */
  async estimatePriceRange(
    details: PriceEstimateInput
  ): Promise<{ min: number; max: number }> {
    return this.callTool(
      "estimate_price_range",
      "Estimate a fair market price range in Nigerian Naira (NGN) for an errand.",
      {
        type: "object",
        properties: {
          min: { type: "number" },
          max: { type: "number" },
        },
        required: ["min", "max"],
        additionalProperties: false,
      },
      "You estimate fair market rates for errands in Nigeria, in NGN, based on task complexity, implied distance, and effort involved.",
      JSON.stringify(details)
    );
  }

  /** Feature C: rewrites a boosted errand's title to be more appealing to runners. */
  async rewriteBoostTitle(title: string, description: string): Promise<string> {
    const result = await this.callTool<{ title: string }>(
      "rewrite_title",
      "Rewrite an errand title to sound more appealing and urgent to potential runners, while staying honest and accurate.",
      {
        type: "object",
        properties: {
          title: { type: "string" },
        },
        required: ["title"],
        additionalProperties: false,
      },
      "You rewrite errand titles to attract runners without exaggerating or misleading them. Keep it short and punchy.",
      `Original title: ${title}\nDescription: ${description}`
    );
    return result.title;
  }

  /** Feature D: up to 3 quick-reply suggestions based on recent conversation context. */
  async generateSmartReplies(
    recentMessages: { fromUserId: string; text: string }[]
  ): Promise<string[]> {
    const result = await this.callTool<{ replies: string[] }>(
      "suggest_replies",
      "Suggest exactly 3 short quick-reply options based on the recent conversation.",
      {
        type: "object",
        properties: {
          replies: { type: "array", items: { type: "string" } },
        },
        required: ["replies"],
        additionalProperties: false,
      },
      "You suggest exactly 3 short, natural quick-reply options (a few words each) that a participant in this conversation might send next.",
      recentMessages.map((m) => `${m.fromUserId}: ${m.text}`).join("\n")
    );
    return (result.replies ?? []).slice(0, 3);
  }
}
