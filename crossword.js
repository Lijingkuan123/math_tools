"use strict";

(() => {
  const CANVAS_WIDTH = 1240;
  const CANVAS_HEIGHT = 1754;
  const NUMBER_INDEXES = [0, 2, 4];
  const CATEGORY_LABELS = {
    addsub: "100 以内加减法",
    muldiv: "九九乘除法",
  };
  const OPERATOR_LABELS = {
    "+": "+",
    "-": "−",
    "×": "×",
    "÷": "÷",
  };

  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  function cellKey(row, column) {
    return `${row},${column}`;
  }

  function equationTokens(equation) {
    return [
      String(equation.left),
      OPERATOR_LABELS[equation.operator],
      String(equation.right),
      "=",
      String(equation.result),
    ];
  }

  function createEquationPools() {
    const pools = { addsub: [], muldiv: [] };

    for (let left = 1; left <= 99; left += 1) {
      for (let right = left; left + right <= 100; right += 1) {
        pools.addsub.push({
          left,
          operator: "+",
          right,
          result: left + right,
          category: "addsub",
          key: `${left}+${right}=${left + right}`,
        });
      }
    }
    for (let left = 2; left <= 100; left += 1) {
      for (let right = 1; right < left; right += 1) {
        pools.addsub.push({
          left,
          operator: "-",
          right,
          result: left - right,
          category: "addsub",
          key: `${left}-${right}=${left - right}`,
        });
      }
    }

    for (let left = 1; left <= 9; left += 1) {
      for (let right = left; right <= 9; right += 1) {
        pools.muldiv.push({
          left,
          operator: "×",
          right,
          result: left * right,
          category: "muldiv",
          key: `${left}x${right}=${left * right}`,
        });
      }
    }
    for (let divisor = 1; divisor <= 9; divisor += 1) {
      for (let result = 1; result <= 9; result += 1) {
        pools.muldiv.push({
          left: divisor * result,
          operator: "÷",
          right: divisor,
          result,
          category: "muldiv",
          key: `${divisor * result}/${divisor}=${result}`,
        });
      }
    }
    return pools;
  }

  const EQUATION_POOLS = createEquationPools();
  const EQUATIONS_BY_VALUE = Object.fromEntries(
    Object.entries(EQUATION_POOLS).map(([category, equations]) => {
      const index = new Map();
      for (const equation of equations) {
        for (const value of [equation.left, equation.right, equation.result]) {
          const matches = index.get(value) || [];
          matches.push(equation);
          index.set(value, matches);
        }
      }
      return [category, index];
    }),
  );

  function categorySchedule(mode, count, random) {
    if (mode !== "mixed") return Array(count).fill(mode);
    const schedule = [];
    const first = random() < 0.5 ? "addsub" : "muldiv";
    for (let index = 0; index < count; index += 1) {
      schedule.push(index % 2 === 0 ? first : (first === "addsub" ? "muldiv" : "addsub"));
    }
    return schedule;
  }

  function makeCell(row, column, token, orientation, equationId) {
    return {
      row,
      column,
      token,
      type: /^\d+$/.test(token) ? "number" : "symbol",
      orientations: new Set([orientation]),
      equationIds: new Set([equationId]),
    };
  }

  function directionFor(orientation) {
    return orientation === "horizontal"
      ? { row: 0, column: 1 }
      : { row: 1, column: 0 };
  }

  function coordinatesFor(startRow, startColumn, orientation, index) {
    const direction = directionFor(orientation);
    return {
      row: startRow + direction.row * index,
      column: startColumn + direction.column * index,
    };
  }

  function uniqueNumberCount(puzzle, equationId) {
    const placement = puzzle.equations.find((item) => item.id === equationId);
    if (!placement) return 0;
    return NUMBER_INDEXES.reduce((count, tokenIndex) => {
      const coordinate = placement.coordinates[tokenIndex];
      const cell = puzzle.cells.get(cellKey(coordinate.row, coordinate.column));
      return count + (cell?.equationIds.size === 1 ? 1 : 0);
    }, 0);
  }

  function canPlace(puzzle, equation, orientation, startRow, startColumn, anchorIndex) {
    const tokens = equationTokens(equation);
    const direction = directionFor(orientation);
    const beforeKey = cellKey(startRow - direction.row, startColumn - direction.column);
    const afterKey = cellKey(startRow + direction.row * 5, startColumn + direction.column * 5);
    if (puzzle.cells.has(beforeKey) || puzzle.cells.has(afterKey)) return false;

    for (let index = 0; index < tokens.length; index += 1) {
      const coordinate = coordinatesFor(startRow, startColumn, orientation, index);
      const existing = puzzle.cells.get(cellKey(coordinate.row, coordinate.column));
      if (!existing) continue;
      if (index !== anchorIndex) return false;
      if (existing.type !== "number" || existing.token !== tokens[index]) return false;
      if (existing.orientations.has(orientation)) return false;
      for (const equationId of existing.equationIds) {
        if (uniqueNumberCount(puzzle, equationId) <= 1) return false;
      }
    }
    return true;
  }

  function addEquation(puzzle, equation, orientation, startRow, startColumn) {
    const id = puzzle.equations.length;
    const tokens = equationTokens(equation);
    const coordinates = tokens.map((token, index) => (
      coordinatesFor(startRow, startColumn, orientation, index)
    ));

    tokens.forEach((token, index) => {
      const coordinate = coordinates[index];
      const key = cellKey(coordinate.row, coordinate.column);
      const existing = puzzle.cells.get(key);
      if (existing) {
        existing.orientations.add(orientation);
        existing.equationIds.add(id);
      } else {
        puzzle.cells.set(
          key,
          makeCell(coordinate.row, coordinate.column, token, orientation, id),
        );
      }
    });

    puzzle.equations.push({
      id,
      equation,
      orientation,
      coordinates,
    });
    puzzle.usedKeys.add(equation.key);
  }

  function findPlacement(puzzle, category, random) {
    const anchors = shuffle(
      [...puzzle.cells.values()].filter((cell) => (
        cell.type === "number" && cell.orientations.size === 1
      )),
      random,
    );

    for (const anchor of anchors) {
      const orientation = anchor.orientations.has("horizontal") ? "vertical" : "horizontal";
      const matches = shuffle(
        EQUATIONS_BY_VALUE[category].get(Number(anchor.token)) || [],
        random,
      );
      for (const equation of matches.slice(0, 160)) {
        if (puzzle.usedKeys.has(equation.key)) continue;
        const tokens = equationTokens(equation);
        const matchingIndexes = shuffle(
          NUMBER_INDEXES.filter((index) => tokens[index] === anchor.token),
          random,
        );
        for (const anchorIndex of matchingIndexes) {
          const direction = directionFor(orientation);
          const startRow = anchor.row - direction.row * anchorIndex;
          const startColumn = anchor.column - direction.column * anchorIndex;
          if (canPlace(
            puzzle,
            equation,
            orientation,
            startRow,
            startColumn,
            anchorIndex,
          )) {
            return { equation, orientation, startRow, startColumn };
          }
        }
      }
    }
    return null;
  }

  function assignBlankCells(puzzle, random) {
    puzzle.blankKeys = new Set();
    for (const placement of shuffle(puzzle.equations, random)) {
      const currentBlanks = NUMBER_INDEXES.filter((index) => {
        const coordinate = placement.coordinates[index];
        return puzzle.blankKeys.has(cellKey(coordinate.row, coordinate.column));
      });
      if (currentBlanks.length) continue;

      const uniqueCandidates = NUMBER_INDEXES.filter((index) => {
        const coordinate = placement.coordinates[index];
        const cell = puzzle.cells.get(cellKey(coordinate.row, coordinate.column));
        return cell?.equationIds.size === 1;
      });
      const preferred = uniqueCandidates.filter((index) => index !== 0);
      const candidates = preferred.length ? preferred : uniqueCandidates;
      const selectedIndex = candidates[Math.floor(random() * candidates.length)];
      const selected = placement.coordinates[selectedIndex];
      puzzle.blankKeys.add(cellKey(selected.row, selected.column));
    }
  }

  function puzzleBounds(puzzle) {
    const cells = [...puzzle.cells.values()];
    return {
      minRow: Math.min(...cells.map((cell) => cell.row)),
      maxRow: Math.max(...cells.map((cell) => cell.row)),
      minColumn: Math.min(...cells.map((cell) => cell.column)),
      maxColumn: Math.max(...cells.map((cell) => cell.column)),
    };
  }

  function buildPuzzle(mode, count, random) {
    const schedule = categorySchedule(mode, count, random);
    const puzzle = {
      mode,
      targetCount: count,
      cells: new Map(),
      equations: [],
      usedKeys: new Set(),
      blankKeys: new Set(),
    };
    const seedPool = EQUATION_POOLS[schedule[0]];
    const seed = seedPool[Math.floor(random() * seedPool.length)];
    addEquation(puzzle, seed, "horizontal", 0, 0);

    for (let index = 1; index < schedule.length; index += 1) {
      let placement = findPlacement(puzzle, schedule[index], random);
      if (!placement && mode === "mixed") {
        const fallbackCategory = schedule[index] === "addsub" ? "muldiv" : "addsub";
        placement = findPlacement(puzzle, fallbackCategory, random);
      }
      if (!placement) break;
      addEquation(
        puzzle,
        placement.equation,
        placement.orientation,
        placement.startRow,
        placement.startColumn,
      );
    }
    assignBlankCells(puzzle, random);
    puzzle.bounds = puzzleBounds(puzzle);
    return puzzle;
  }

  function generatePuzzle({ mode = "mixed", count = 20, random = Math.random } = {}) {
    const safeMode = ["mixed", "addsub", "muldiv"].includes(mode) ? mode : "mixed";
    const safeCount = [10, 20, 30].includes(Number(count)) ? Number(count) : 20;
    let best = null;

    function layoutScore(puzzle) {
      const bounds = puzzle.bounds;
      const rows = bounds.maxRow - bounds.minRow + 1;
      const columns = bounds.maxColumn - bounds.minColumn + 1;
      const cellSize = Math.min(1040 / columns, 1190 / rows);
      const density = puzzle.cells.size / (rows * columns);
      return puzzle.equations.length * 100000 + cellSize * 100 + density;
    }

    const attempts = safeCount === 30 ? 18 : safeCount === 20 ? 9 : 4;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const puzzle = buildPuzzle(safeMode, safeCount, random);
      if (!best || layoutScore(puzzle) > layoutScore(best)) best = puzzle;
    }
    return best;
  }

  function validatePuzzle(puzzle) {
    const errors = [];
    if (!puzzle || !puzzle.equations?.length) return { valid: false, errors: ["题目为空"] };
    if (puzzle.equations.length !== puzzle.targetCount) {
      errors.push(`题量不足：${puzzle.equations.length}/${puzzle.targetCount}`);
    }

    for (const placement of puzzle.equations) {
      const { equation } = placement;
      const validMath = equation.operator === "+"
        ? equation.left + equation.right === equation.result
        : equation.operator === "-"
          ? equation.left - equation.right === equation.result
          : equation.operator === "×"
            ? equation.left * equation.right === equation.result
            : equation.left / equation.right === equation.result;
      if (!validMath) errors.push(`算式错误：${equation.key}`);

      const blankCount = NUMBER_INDEXES.filter((index) => {
        const coordinate = placement.coordinates[index];
        return puzzle.blankKeys.has(cellKey(coordinate.row, coordinate.column));
      }).length;
      if (blankCount !== 1) errors.push(`空格数量错误：${equation.key}`);

      equationTokens(equation).forEach((token, index) => {
        const coordinate = placement.coordinates[index];
        const cell = puzzle.cells.get(cellKey(coordinate.row, coordinate.column));
        if (!cell || cell.token !== token) errors.push(`交叉内容冲突：${equation.key}`);
      });
    }
    return { valid: errors.length === 0, errors };
  }

  function roundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
  }

  function drawWorksheet(puzzle, canvas, showAnswers = false) {
    if (!puzzle || !canvas) return;
    const context = canvas.getContext("2d");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    context.fillStyle = "#17332d";
    context.fillRect(0, 0, CANVAS_WIDTH, 22);
    context.fillStyle = "#f4c95d";
    context.fillRect(0, 22, CANVAS_WIDTH, 9);

    context.fillStyle = "#65736f";
    context.font = "700 25px sans-serif";
    context.fillText("数学练习", 100, 112);
    context.fillStyle = "#182825";
    context.font = "800 58px sans-serif";
    context.fillText(showAnswers ? "算式填字 · 答案" : "算式填字", 100, 190);

    const categories = [...new Set(puzzle.equations.map((item) => item.equation.category))];
    const categoryText = categories.map((category) => CATEGORY_LABELS[category]).join(" + ");
    context.fillStyle = "#65736f";
    context.font = "400 25px sans-serif";
    context.fillText(`${categoryText}  ·  ${puzzle.equations.length} 道`, 102, 236);

    context.strokeStyle = "#8e9995";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(100, 276);
    context.lineTo(1140, 276);
    context.stroke();
    context.fillStyle = "#344540";
    context.font = "500 23px sans-serif";
    context.fillText("姓名：________________", 100, 328);
    context.fillText("日期：________________", 480, 328);
    context.fillText("用时：________________", 860, 328);

    const bounds = puzzle.bounds;
    const columnCount = bounds.maxColumn - bounds.minColumn + 1;
    const rowCount = bounds.maxRow - bounds.minRow + 1;
    const puzzleWidth = 1040;
    const puzzleHeight = 1190;
    const cellSize = Math.min(94, puzzleWidth / columnCount, puzzleHeight / rowCount);
    const drawnWidth = cellSize * columnCount;
    const drawnHeight = cellSize * rowCount;
    const originX = (CANVAS_WIDTH - drawnWidth) / 2;
    const originY = 382 + (puzzleHeight - drawnHeight) / 2;

    context.lineWidth = Math.max(2.5, cellSize * 0.042);
    context.strokeStyle = "#17211f";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `800 ${Math.max(20, cellSize * 0.43)}px sans-serif`;

    const cells = [...puzzle.cells.values()].sort((left, right) => (
      left.row - right.row || left.column - right.column
    ));
    for (const cell of cells) {
      const x = originX + (cell.column - bounds.minColumn) * cellSize;
      const y = originY + (cell.row - bounds.minRow) * cellSize;
      context.fillStyle = "#ffffff";
      context.fillRect(x, y, cellSize, cellSize);
      context.strokeRect(x, y, cellSize, cellSize);

      const hiddenNumber = cell.type === "number"
        && puzzle.blankKeys.has(cellKey(cell.row, cell.column));
      if (!hiddenNumber || showAnswers) {
        context.fillStyle = hiddenNumber ? "#1f745f" : "#17211f";
        context.fillText(cell.token, x + cellSize / 2, y + cellSize / 2 + cellSize * 0.015);
      }
    }

    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.fillStyle = "#65736f";
    context.font = "500 22px sans-serif";
    context.fillText("横向、竖向算式都成立", 100, 1662);
    context.textAlign = "right";
    context.fillText(showAnswers ? "绿色数字为空格答案" : `共 ${puzzle.blankKeys.size} 个空格`, 1140, 1662);

    context.strokeStyle = "#d7ded9";
    context.lineWidth = 2;
    roundedRect(context, 82, 64, 1076, 1632, 8);
    context.stroke();
  }

  function selectedValue(name, fallback) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
  }

  function initializeUi() {
    const canvas = document.querySelector("#crosswordCanvas");
    const generateButton = document.querySelector("#generateCrosswordButton");
    const downloadQuestionButton = document.querySelector("#downloadCrosswordButton");
    const downloadAnswerButton = document.querySelector("#downloadCrosswordAnswerButton");
    const printButton = document.querySelector("#printCrosswordButton");
    const answerToggle = document.querySelector("#crosswordAnswerToggle");
    const status = document.querySelector("#crosswordStatus");
    if (!canvas || !generateButton) return;

    let currentPuzzle = null;

    function render() {
      drawWorksheet(currentPuzzle, canvas, answerToggle.checked);
      const categories = [...new Set(
        currentPuzzle.equations.map((item) => CATEGORY_LABELS[item.equation.category]),
      )];
      status.textContent = `${categories.join(" + ")} · ${currentPuzzle.equations.length} 道算式 · ${currentPuzzle.blankKeys.size} 个空格`;
    }

    function generate() {
      generateButton.disabled = true;
      currentPuzzle = generatePuzzle({
        mode: selectedValue("crosswordMode", "mixed"),
        count: Number(selectedValue("crosswordCount", "20")),
      });
      const validation = validatePuzzle(currentPuzzle);
      generateButton.disabled = false;
      if (!validation.valid) {
        status.textContent = "本次排版未完成，请重新生成";
        return;
      }
      answerToggle.checked = false;
      render();
    }

    function fileLabel(answer = false) {
      const now = new Date();
      const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
        .map((value) => String(value).padStart(2, "0"))
        .join("");
      return `算式填字-${date}${answer ? "-答案" : ""}.png`;
    }

    function download(answer) {
      drawWorksheet(currentPuzzle, canvas, answer);
      const link = document.createElement("a");
      link.download = fileLabel(answer);
      link.href = canvas.toDataURL("image/png");
      link.click();
      drawWorksheet(currentPuzzle, canvas, answerToggle.checked);
    }

    generateButton.addEventListener("click", generate);
    downloadQuestionButton.addEventListener("click", () => download(false));
    downloadAnswerButton.addEventListener("click", () => download(true));
    printButton.addEventListener("click", () => window.print());
    answerToggle.addEventListener("change", render);
    document.querySelectorAll('input[name="crosswordMode"], input[name="crosswordCount"]')
      .forEach((input) => input.addEventListener("change", generate));

    generate();
    return {
      getPuzzle: () => currentPuzzle,
      generate,
      render,
    };
  }

  window.ArithmeticCrossword = {
    generatePuzzle,
    validatePuzzle,
    drawWorksheet,
    equationTokens,
    initializeUi,
  };
  window.crosswordUi = initializeUi();
})();
