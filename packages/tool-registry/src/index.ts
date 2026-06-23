import type { ZodSchema } from "zod";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ToolHandler = (input: unknown) => Promise<unknown>;

export interface RegisteredTool {
  definition: ToolDefinition;
  schema: ZodSchema;
  handler: ToolHandler;
}

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  register(
    definition: ToolDefinition,
    schema: ZodSchema,
    handler: ToolHandler,
  ): void {
    this.tools.set(definition.name, { definition, schema, handler });
  }

  resolve(name: string): RegisteredTool | null {
    return this.tools.get(name) ?? null;
  }

  validate(name: string, input: unknown): { success: true; data: unknown } | { success: false; error: string } {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${name}` };
    }
    const result = tool.schema.safeParse(input);
    if (!result.success) {
      return { success: false, error: result.error.message };
    }
    return { success: true, data: result.data };
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }
}

export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}
