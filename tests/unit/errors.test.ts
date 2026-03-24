import { describe, expect, it } from "vitest"
import { isMissingFileError } from "../../src/tools/errors.js"

describe("isMissingFileError", () => {
  it("returns false for non-object values", () => {
    expect(isMissingFileError("ENOENT")).toBe(false)
    expect(isMissingFileError(null)).toBe(false)
  })

  it("returns true only for ENOENT object errors", () => {
    expect(isMissingFileError({ code: "ENOENT" })).toBe(true)
    expect(isMissingFileError({ code: "EISDIR" })).toBe(false)
  })
})
