class Calculator {
  constructor() {
    this.currentValue = '0';
    this.previousValue = '';
    this.operator = null;
    this.shouldResetDisplay = false;
    this.expression = '';
  }

  inputNumber(num) {
    if (this.shouldResetDisplay) {
      this.currentValue = num;
      this.shouldResetDisplay = false;
    } else {
      this.currentValue = this.currentValue === '0' ? num : this.currentValue + num;
    }
  }

  inputDecimal() {
    if (this.shouldResetDisplay) {
      this.currentValue = '0.';
      this.shouldResetDisplay = false;
      return;
    }
    if (!this.currentValue.includes('.')) {
      this.currentValue += '.';
    }
  }

  inputOperator(op) {
    if (this.operator && !this.shouldResetDisplay) {
      this.calculate();
    }
    this.previousValue = this.currentValue;
    this.operator = op;
    this.expression = this.formatExpression(this.previousValue, op);
    this.shouldResetDisplay = true;
  }

  formatExpression(value, op) {
    const opSymbol = { '+': '+', '-': '\u2212', '*': '\u00d7', '/': '\u00f7' }[op] || op;
    return `${value} ${opSymbol}`;
  }

  calculate() {
    if (this.operator === null || this.shouldResetDisplay) return;

    const prev = parseFloat(this.previousValue);
    const curr = parseFloat(this.currentValue);

    if (isNaN(prev) || isNaN(curr)) return;

    let result;
    switch (this.operator) {
      case '+': result = prev + curr; break;
      case '-': result = prev - curr; break;
      case '*': result = prev * curr; break;
      case '/':
        if (curr === 0) {
          this.currentValue = 'Error';
          this.expression = '';
          this.operator = null;
          this.previousValue = '';
          this.shouldResetDisplay = true;
          return;
        }
        result = prev / curr;
        break;
      default: return;
    }

    this.expression = `${this.previousValue} ${this.formatExpression(this.previousValue, this.operator).split(' ')[1]} ${this.currentValue} =`;
    this.currentValue = this.formatResult(result);
    this.operator = null;
    this.previousValue = '';
    this.shouldResetDisplay = true;
  }

  formatResult(num) {
    if (Number.isInteger(num)) return num.toString();
    const str = parseFloat(num.toPrecision(12)).toString();
    return str;
  }

  toggleSign() {
    if (this.currentValue === '0' || this.currentValue === 'Error') return;
    this.currentValue = this.currentValue.startsWith('-')
      ? this.currentValue.slice(1)
      : '-' + this.currentValue;
  }

  percent() {
    if (this.currentValue === 'Error') return;
    this.currentValue = this.formatResult(parseFloat(this.currentValue) / 100);
  }

  clear() {
    this.currentValue = '0';
    this.previousValue = '';
    this.operator = null;
    this.shouldResetDisplay = false;
    this.expression = '';
  }

  getDisplayValue() {
    return this.currentValue;
  }

  getExpression() {
    return this.expression;
  }
}

// DOM interaction (only runs in browser)
if (typeof document !== 'undefined') {
  const calculator = new Calculator();
  const display = document.getElementById('display');
  const expressionDisplay = document.getElementById('expression');

  function updateDisplay() {
    display.textContent = calculator.getDisplayValue();
    expressionDisplay.textContent = calculator.getExpression();
  }

  document.querySelector('.buttons').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;

    const action = btn.dataset.action;
    const value = btn.dataset.value;

    switch (action) {
      case 'number':
        calculator.inputNumber(value);
        break;
      case 'decimal':
        calculator.inputDecimal();
        break;
      case 'operator':
        calculator.inputOperator(value);
        break;
      case 'equals':
        calculator.calculate();
        break;
      case 'clear':
        calculator.clear();
        break;
      case 'sign':
        calculator.toggleSign();
        break;
      case 'percent':
        calculator.percent();
        break;
    }

    updateDisplay();
  });
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Calculator };
}
