#!/usr/bin/env python3
"""Main entry point for the calculator application."""

from calculator import Calculator

def main():
    """Run the calculator application."""
    calc = Calculator()
    
    print("Simple Calculator")
    print("-" * 20)
    
    # Demo calculations
    print(f"10 + 5 = {calc.add(10, 5)}")
    print(f"10 - 5 = {calc.subtract(10, 5)}")
    print(f"10 * 5 = {calc.multiply(10, 5)}")
    print(f"10 / 5 = {calc.divide(10, 5)}")
    print(f"2 ^ 8 = {calc.power(2, 8)}")
    
    # Interactive mode
    while True:
        try:
            operation = input("\nEnter operation (+, -, *, /, ^, quit): ").strip()
            if operation.lower() == 'quit':
                break
                
            a = float(input("Enter first number: "))
            b = float(input("Enter second number: "))
            
            if operation == '+':
                result = calc.add(a, b)
            elif operation == '-':
                result = calc.subtract(a, b)
            elif operation == '*':
                result = calc.multiply(a, b)
            elif operation == '/':
                result = calc.divide(a, b)
            elif operation == '^':
                result = calc.power(a, b)
            else:
                print("Invalid operation")
                continue
                
            print(f"Result: {result}")
            
        except ValueError as e:
            print(f"Error: {e}")
        except KeyboardInterrupt:
            print("\nGoodbye!")
            break

if __name__ == "__main__":
    main()
