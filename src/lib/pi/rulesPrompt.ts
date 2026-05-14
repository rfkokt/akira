/**
 * Constructs a prompt by prepending rules content before the user message.
 * Rules are separated from the user message by a double newline.
 *
 * @param rules - The project rules content to prepend
 * @param userMessage - The user's prompt message
 * @returns The constructed prompt with rules appearing before the user message
 */
export function constructPromptWithRules(rules: string, userMessage: string): string {
  return rules + "\n\n" + userMessage;
}
