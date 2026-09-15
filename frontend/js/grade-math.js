/** Pure grade formulas. All inputs are percentages, not fractions. */
function percent(n, label) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100)
    throw new Error(`${label} must be between 0 and 100.`);
}
export function requiredGrade(current, target, remaining) {
  percent(current, "Current grade");
  percent(target, "Target");
  percent(remaining, "Remaining weight");
  if (remaining === 0)
    throw new Error("Remaining weight must be greater than zero.");
  return (target - current * (1 - remaining / 100)) / (remaining / 100);
}
export function projectedGrade(current, score, remaining) {
  percent(current, "Current grade");
  percent(score, "Expected score");
  percent(remaining, "Remaining weight");
  return current * (1 - remaining / 100) + (score * remaining) / 100;
}
export function weightedAverage(rows) {
  if (!Array.isArray(rows) || !rows.length)
    throw new Error("Add at least one score.");
  let sum = 0,
    total = 0;
  for (const r of rows) {
    percent(r.score, "Score");
    percent(r.weight, "Weight");
    sum += r.score * r.weight;
    total += r.weight;
  }
  if (!total) throw new Error("Total weight must be greater than zero.");
  return sum / total;
}
export function calculatePlan(p) {
  if (!p || typeof p !== "object")
    throw new Error("Please provide the grades and weights.");
  const f = (n) => Number(n).toFixed(2);
  if (p.kind === "arithmetic") {
    const v = arithmetic(p.expression);
    return {
      value: v,
      text: `${p.expression} = ${Number(v.toPrecision(12))}\nCalculated with standard operator precedence. % means divide by 100; decimal results are rounded to 12 significant digits.`,
    };
  }
  if (p.kind === "required") {
    const v = requiredGrade(p.current, p.target, p.remaining);
    return {
      value: v,
      text: `You need ${f(v)}% on the remaining work.\n(${p.target} − ${p.current} × ${f(1 - p.remaining / 100)}) ÷ ${f(p.remaining / 100)} = ${f(v)}%\n${v > 100 ? "This target is not reachable with a maximum score of 100%." : v < 0 ? "Your target is already secured under these weights, even with 0% on the remaining work." : "Assumes your current mark represents all completed work and the remaining weight is accurate."}`,
    };
  }
  if (p.kind === "projected") {
    const v = projectedGrade(p.current, p.score, p.remaining);
    return {
      value: v,
      text: `Your projected final grade is ${f(v)}%.\n${p.current} × ${f(1 - p.remaining / 100)} + ${p.score} × ${f(p.remaining / 100)} = ${f(v)}%\nAssumes the supplied weights describe your final grade.`,
    };
  }
  if (p.kind === "average") {
    const v = weightedAverage(p.rows);
    return {
      value: v,
      text: `Your weighted average is ${f(v)}%.\nSum of (score × weight) ÷ total weight. Weights are normalized across the scores you supplied.`,
    };
  }
  throw new Error(
    "Use a target-grade, projected-grade, or weighted-average question.",
  );
}
/** Explicit supported syntax for offline use. General language goes to the AI parser. */
export function localPlan(text) {
  const expr = text
    .trim()
    .replace(/^(?:what is|calculate)\s+/i, "")
    .replace(/\?$/, "");
  if (/^[\d\s.()+*/^%×÷−-]+$/.test(expr) || /^sqrt\(/.test(expr))
    return { kind: "arithmetic", expression: expr };
  let m = text
    .trim()
    .match(
      /^current\s+(\d+(?:\.\d+)?)\s*,\s*target\s+(\d+(?:\.\d+)?)\s*,\s*remaining\s+(\d+(?:\.\d+)?)%?$/i,
    );
  if (m)
    return {
      kind: "required",
      current: +m[1],
      target: +m[2],
      remaining: +m[3],
    };
  m = text
    .trim()
    .match(
      /^current\s+(\d+(?:\.\d+)?)\s*,\s*score\s+(\d+(?:\.\d+)?)\s*,\s*remaining\s+(\d+(?:\.\d+)?)%?$/i,
    );
  if (m)
    return {
      kind: "projected",
      current: +m[1],
      score: +m[2],
      remaining: +m[3],
    };
  return null;
}
/** Small arithmetic parser: no eval, code execution, variables, or network. */
export function arithmetic(expression) {
  if (typeof expression !== "string" || expression.length > 500)
    throw new Error("Use an expression of up to 500 characters.");
  if (/[\d.]\s+[\d.]/.test(expression))
    throw new Error("Put an operator between numbers.");
  const source = expression
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/\s+/g, "");
  const tokens =
    source.match(/(?:\d+(?:\.\d*)?|\.\d+)|sqrt|[()+\-*/^%]/g) || [];
  if (tokens.join("") !== source || !tokens.length)
    throw new Error("Use numbers, +, −, ×, ÷, ^, %, sqrt(), and parentheses.");
  let at = 0,
    depth = 0;
  function atom() {
    if (++depth > 80) throw new Error("Expression is too deeply nested.");
    let n,
      t = tokens[at++];
    if (t === "(") {
      n = sum();
      if (tokens[at++] !== ")") throw new Error("Close each parenthesis.");
    } else if (t === "sqrt") {
      if (tokens[at++] !== "(") throw new Error("Use sqrt(number).");
      n = Math.sqrt(sum());
      if (tokens[at++] !== ")") throw new Error("Close each parenthesis.");
    } else if (t && /^\d|^\./.test(t)) {
      n = Number(t);
    } else throw new Error("A number is missing.");
    depth--;
    while (tokens[at] === "%") {
      at++;
      n /= 100;
    }
    return n;
  }
  function power() {
    const left = atom();
    if (tokens[at] === "^") {
      at++;
      return left ** unary();
    }
    return left;
  }
  function unary() {
    if (tokens[at] === "+") {
      at++;
      return unary();
    }
    if (tokens[at] === "-") {
      at++;
      return -unary();
    }
    return power();
  }
  function product() {
    let n = unary();
    while (tokens[at] === "*" || tokens[at] === "/") {
      const op = tokens[at++],
        r = unary();
      if (op === "/" && r === 0)
        throw new Error("Division by zero is undefined.");
      n = op === "*" ? n * r : n / r;
    }
    return n;
  }
  function sum() {
    let n = product();
    while (tokens[at] === "+" || tokens[at] === "-") {
      const op = tokens[at++],
        r = product();
      n = op === "+" ? n + r : n - r;
    }
    return n;
  }
  const value = sum();
  if (at !== tokens.length)
    throw new Error("Check the operators and parentheses.");
  if (!Number.isFinite(value))
    throw new Error("This expression has no finite real result.");
  return value;
}
