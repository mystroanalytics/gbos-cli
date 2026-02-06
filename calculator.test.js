const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Calculator } = require('./script.js');

describe('Calculator', () => {
  let calc;

  it('should initialize with display value 0', () => {
    calc = new Calculator();
    assert.strictEqual(calc.getDisplayValue(), '0');
  });

  describe('Number input', () => {
    it('should replace initial 0 with digit', () => {
      calc = new Calculator();
      calc.inputNumber('5');
      assert.strictEqual(calc.getDisplayValue(), '5');
    });

    it('should append digits', () => {
      calc = new Calculator();
      calc.inputNumber('1');
      calc.inputNumber('2');
      calc.inputNumber('3');
      assert.strictEqual(calc.getDisplayValue(), '123');
    });

    it('should handle zero input correctly', () => {
      calc = new Calculator();
      calc.inputNumber('0');
      calc.inputNumber('0');
      assert.strictEqual(calc.getDisplayValue(), '0');
    });
  });

  describe('Decimal input', () => {
    it('should add decimal point', () => {
      calc = new Calculator();
      calc.inputNumber('3');
      calc.inputDecimal();
      calc.inputNumber('5');
      assert.strictEqual(calc.getDisplayValue(), '3.5');
    });

    it('should not add duplicate decimal point', () => {
      calc = new Calculator();
      calc.inputNumber('3');
      calc.inputDecimal();
      calc.inputDecimal();
      calc.inputNumber('5');
      assert.strictEqual(calc.getDisplayValue(), '3.5');
    });

    it('should start with 0. when decimal pressed on reset', () => {
      calc = new Calculator();
      calc.inputNumber('5');
      calc.inputOperator('+');
      calc.inputDecimal();
      calc.inputNumber('5');
      assert.strictEqual(calc.getDisplayValue(), '0.5');
    });
  });

  describe('Addition', () => {
    it('should add two numbers', () => {
      calc = new Calculator();
      calc.inputNumber('5');
      calc.inputOperator('+');
      calc.inputNumber('3');
      calc.calculate();
      assert.strictEqual(calc.getDisplayValue(), '8');
    });

    it('should add decimals correctly', () => {
      calc = new Calculator();
      calc.inputNumber('1');
      calc.inputDecimal();
      calc.inputNumber('5');
      calc.inputOperator('+');
      calc.inputNumber('2');
      calc.inputDecimal();
      calc.inputNumber('5');
      calc.calculate();
      assert.strictEqual(calc.getDisplayValue(), '4');
    });
  });

  describe('Subtraction', () => {
    it('should subtract two numbers', () => {
      calc = new Calculator();
      calc.inputNumber('9');
      calc.inputOperator('-');
      calc.inputNumber('4');
      calc.calculate();
      assert.strictEqual(calc.getDisplayValue(), '5');
    });

    it('should handle negative results', () => {
      calc = new Calculator();
      calc.inputNumber('3');
      calc.inputOperator('-');
      calc.inputNumber('7');
      calc.calculate();
      assert.strictEqual(calc.getDisplayValue(), '-4');
    });
  });

  describe('Multiplication', () => {
    it('should multiply two numbers', () => {
      calc = new Calculator();
      calc.inputNumber('6');
      calc.inputOperator('*');
      calc.inputNumber('7');
      calc.calculate();
      assert.strictEqual(calc.getDisplayValue(), '42');
    });

    it('should handle multiplication by zero', () => {
      calc = new Calculator();
      calc.inputNumber('5');
      calc.inputOperator('*');
      calc.inputNumber('0');
      calc.calculate();
      assert.strictEqual(calc.getDisplayValue(), '0');
    });
  });

  describe('Division', () => {
    it('should divide two numbers', () => {
      calc = new Calculator();
      calc.inputNumber('8');
      calc.inputOperator('/');
      calc.inputNumber('2');
      calc.calculate();
      assert.strictEqual(calc.getDisplayValue(), '4');
    });

    it('should handle decimal division results', () => {
      calc = new Calculator();
      calc.inputNumber('1');
      calc.inputNumber('0');
      calc.inputOperator('/');
      calc.inputNumber('3');
      calc.calculate();
      const result = parseFloat(calc.getDisplayValue());
      assert.ok(Math.abs(result - 3.33333333333) < 0.001);
    });

    it('should show error for division by zero', () => {
      calc = new Calculator();
      calc.inputNumber('5');
      calc.inputOperator('/');
      calc.inputNumber('0');
      calc.calculate();
      assert.strictEqual(calc.getDisplayValue(), 'Error');
    });
  });

  describe('Chained operations', () => {
    it('should chain operations (2 + 3 then * 4)', () => {
      calc = new Calculator();
      calc.inputNumber('2');
      calc.inputOperator('+');
      calc.inputNumber('3');
      calc.inputOperator('*');
      // At this point 2+3=5 should have been calculated
      assert.strictEqual(calc.getDisplayValue(), '5');
      calc.inputNumber('4');
      calc.calculate();
      assert.strictEqual(calc.getDisplayValue(), '20');
    });

    it('should chain multiple additions', () => {
      calc = new Calculator();
      calc.inputNumber('1');
      calc.inputOperator('+');
      calc.inputNumber('2');
      calc.inputOperator('+');
      calc.inputNumber('3');
      calc.calculate();
      assert.strictEqual(calc.getDisplayValue(), '6');
    });
  });

  describe('Clear', () => {
    it('should reset everything on clear', () => {
      calc = new Calculator();
      calc.inputNumber('5');
      calc.inputOperator('+');
      calc.inputNumber('3');
      calc.clear();
      assert.strictEqual(calc.getDisplayValue(), '0');
      assert.strictEqual(calc.getExpression(), '');
    });
  });

  describe('Toggle sign', () => {
    it('should toggle positive to negative', () => {
      calc = new Calculator();
      calc.inputNumber('5');
      calc.toggleSign();
      assert.strictEqual(calc.getDisplayValue(), '-5');
    });

    it('should toggle negative to positive', () => {
      calc = new Calculator();
      calc.inputNumber('5');
      calc.toggleSign();
      calc.toggleSign();
      assert.strictEqual(calc.getDisplayValue(), '5');
    });

    it('should not toggle zero', () => {
      calc = new Calculator();
      calc.toggleSign();
      assert.strictEqual(calc.getDisplayValue(), '0');
    });
  });

  describe('Percent', () => {
    it('should convert to percentage', () => {
      calc = new Calculator();
      calc.inputNumber('5');
      calc.inputNumber('0');
      calc.percent();
      assert.strictEqual(calc.getDisplayValue(), '0.5');
    });
  });

  describe('Edge cases', () => {
    it('should not crash on equals without operator', () => {
      calc = new Calculator();
      calc.inputNumber('5');
      calc.calculate();
      assert.strictEqual(calc.getDisplayValue(), '5');
    });

    it('should not crash on double equals', () => {
      calc = new Calculator();
      calc.inputNumber('5');
      calc.inputOperator('+');
      calc.inputNumber('3');
      calc.calculate();
      calc.calculate();
      assert.strictEqual(calc.getDisplayValue(), '8');
    });

    it('should allow new calculation after error', () => {
      calc = new Calculator();
      calc.inputNumber('5');
      calc.inputOperator('/');
      calc.inputNumber('0');
      calc.calculate();
      assert.strictEqual(calc.getDisplayValue(), 'Error');
      calc.clear();
      calc.inputNumber('2');
      calc.inputOperator('+');
      calc.inputNumber('3');
      calc.calculate();
      assert.strictEqual(calc.getDisplayValue(), '5');
    });

    it('should start new number after equals', () => {
      calc = new Calculator();
      calc.inputNumber('5');
      calc.inputOperator('+');
      calc.inputNumber('3');
      calc.calculate();
      calc.inputNumber('2');
      assert.strictEqual(calc.getDisplayValue(), '2');
    });
  });
});
