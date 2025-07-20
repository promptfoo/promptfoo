import asyncio
import sys

from orchestrator import (
    main as orchestrator_main,  # Import the orchestrator main function
)


# Function to display a simple text menu in the terminal
def print_menu():
    print("\nWelcome to acp-booksmith!")
    print("Select an option:")
    print("1. Run book generation workflow")
    print("2. Exit")

# Main loop function for CLI (Command Line Interface)
def main():
    while True:
        print_menu()  # Show the menu options
        choice = input("Enter choice [1-2]: ")  # Get user input
        if choice == "1":
            asyncio.run(orchestrator_main())  # Run orchestrator async function to generate book
            print("\n✅ Book generation completed! Check final_book.txt and final_book.pdf.\n")
        elif choice == "2":
            print("Goodbye!")  # Exit message
            sys.exit()  # Exit the program
        else:
            print("Invalid choice. Please enter 1 or 2.")  # Handle invalid input

# Entry point when running script directly
if __name__ == "__main__":
    main()