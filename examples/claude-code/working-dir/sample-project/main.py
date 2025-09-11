#!/usr/bin/env python3
from calculator import Calculator

def main():
    calc = Calculator()
    print("Simple Calculator")
    print(f"10 + 5 = {calc.add(10, 5)}")
    print(f"10 - 5 = {calc.subtract(10, 5)}")
    print(f"10 * 5 = {calc.multiply(10, 5)}")
    print(f"10 / 5 = {calc.divide(10, 5)}")

if __name__ == "__main__":
    main()