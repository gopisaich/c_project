
# Expense Tracker

A personal expense management web application built using C++, HTML, CSS, and JavaScript.

## Features

- Add, edit, delete, and search expenses
- Dashboard with spending summaries
- Interactive category-wise expense chart
- Monthly spending chart
- Monthly budget tracking
- Budget progress and spending warnings
- CSV-based expense storage
- Responsive user interface

## Technologies Used

- C++ — Backend server and API
- HTML — Webpage structure
- CSS — Styling and responsive layout
- JavaScript — Frontend functionality
- CSV — Expense data storage

## Requirements

- Windows
- MinGW g++ compiler
- A web browser
- Git (for version control)

## How to Run

1. Open the project folder in VS Code.
2. Open the terminal in the project folder.
3. Compile the C++ server:

   ```bash
   g++ -std=c++17 server.cpp -o server.exe -lws2_32
   ```

4. Start the server:

   ```powershell
   .\server.exe
   ```

5. Open the following address in your browser:

   http://localhost:18080

Keep the server running while using the application.

## Project Status

Developed as a C++ project.
