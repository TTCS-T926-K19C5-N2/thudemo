import { parse, type ParseError } from "jsonc-parser";

export function parseSeatMapJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    // Native engines do not all expose an offset. Reuse the installed parser
    // only to locate the error; never accept its partial/recovered document.
    const errors: ParseError[] = [];
    parse(text, errors, { disallowComments: true, allowTrailingComma: false });
    const offset = errors[0]?.offset ?? text.length;
    const lines = text.slice(0, offset).split(/\r\n|\r|\n/);
    throw new SyntaxError(`JSON không hợp lệ tại dòng ${lines.length}, cột ${lines.at(-1)!.length + 1}. Sửa toàn bộ tệp rồi thử lại.`);
  }
}
