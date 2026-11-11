"use strict";

const assert = require("node:assert/strict");

global.window = global;
global.document = { querySelector: () => null };
require("../crossword.js");

const modes = ["mixed", "addsub", "muldiv"];
const counts = [10, 20, 30];
let generated = 0;

for (const mode of modes) {
  for (const count of counts) {
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const puzzle = ArithmeticCrossword.generatePuzzle({ mode, count });
      const validation = ArithmeticCrossword.validatePuzzle(puzzle);
      assert.equal(validation.valid, true, validation.errors.join("; "));
      assert.equal(puzzle.equations.length, count);
      assert.equal(puzzle.blankKeys.size, count);

      const categories = new Set(
        puzzle.equations.map((placement) => placement.equation.category),
      );
      if (mode === "mixed") {
        assert.deepEqual([...categories].sort(), ["addsub", "muldiv"]);
      } else {
        assert.deepEqual([...categories], [mode]);
      }
      generated += 1;
    }
  }
}

console.log(`Crossword generator passed ${generated} randomized worksheets.`);
