"use strict";

(() => {
  const DAY_COUNT = 30;
  const QUESTIONS_PER_DAY = 30;
  const booklet = document.querySelector("#booklet");
  const total = document.querySelector("#questionTotal");

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function makePuzzle(day) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const puzzle = window.ArithmeticCrossword.generatePuzzle({
        mode: "mixed",
        count: QUESTIONS_PER_DAY,
        random: seededRandom(20261030 + day * 1009 + attempt * 7919),
      });
      if (window.ArithmeticCrossword.validatePuzzle(puzzle).valid) return puzzle;
    }
    throw new Error(`第 ${day} 天棋盘生成失败`);
  }

  function render(puzzles) {
    booklet.replaceChildren();
    puzzles.forEach((puzzle, index) => {
      const page = document.createElement("article");
      page.className = "worksheet-page";
      page.dataset.day = index + 1;

      const canvas = document.createElement("canvas");
      canvas.width = 1240;
      canvas.height = 1754;
      canvas.className = "worksheet-canvas";
      canvas.setAttribute("aria-label", `第 ${index + 1} 天算式填字练习题`);
      window.ArithmeticCrossword.drawWorksheet(puzzle, canvas, false);

      // Keep the existing crossword artwork and add a day marker to its header.
      const context = canvas.getContext("2d");
      context.fillStyle = "#65736f";
      context.font = "700 25px sans-serif";
      context.textAlign = "right";
      context.fillText(`第 ${index + 1} 天 / ${DAY_COUNT} 天`, 1140, 112);
      context.textAlign = "left";

      page.append(canvas);
      booklet.append(page);
    });
    total.textContent = DAY_COUNT * QUESTIONS_PER_DAY;
  }

  function generate() {
    const puzzles = [];
    for (let day = 1; day <= DAY_COUNT; day += 1) puzzles.push(makePuzzle(day));
    render(puzzles);
  }

  try {
    generate();
  } catch (error) {
    booklet.textContent = error.message;
    booklet.classList.add("booklet-error");
  }

  document.querySelector("#regenerateButton").addEventListener("click", generate);
  document.querySelector("#printButton").addEventListener("click", () => window.print());
})();
