# Application Setup and Usage Guide

Welcome! This guide will help you set up and run the application on your Windows computer. You don't need to be a developer or have technical knowledge to follow these instructions.

---

## Steps to Set Up and Run the Application

### Build the Docker Image

- **Open Command Prompt:**
    - Press the **Windows key** (🪟) on your keyboard.
    - Type **"Command Prompt"**.
    - Right-click on **"Command Prompt"** and select **"Run as administrator"** to ensure you have the necessary permissions.
- **Navigate to the Application Directory:**
    - In the Command Prompt window, type:
      ```cmd
      cd C:\myapp
      ```
      *Replace `C:\myapp` with the path of the directory which contains the `Dockerfile`.*
- **Build the Docker Image:**
    - Type the following command and press **Enter**:
      ```cmd
      docker build --no-cache -t promptfoo_fork .
      ```
        - This command builds the Docker image using the `Dockerfile` in the current directory.
        - `-t promptfoo_fork` assigns the name `promptfoo_fork` to the image. You can replace `promptfoo_fork` with any name you prefer.

### Set up non-source controlled files
#### file DB
Create `fileDb.json` at the root of the project, with the contents: `{}`

#### Set up environment variables
- Create a `.env` file in the root directory of the project if one does not exist
- Add the relevant API keys as environment variables in the `.env` file:
```env
OPENAI_API_KEY=...
GOOGLE_API_KEY=...
```


### Install the application inside the Docker container
- **Start the Docker container:**
    - Type the following command and press **Enter**:
      ```cmd
      docker-compose run app
      ```
  - Install package:
    - Install `ts-node` in the container ???
    - Install promptfoo dependencies
       ```cmd
       npm install
       ```
    - Compile promptfoo
      ```cmd
        npm run build:app
      ```


## Usage
### Launch & enter the Docker container
```cmd
docker-compose run app
```

### Run eval
Once inside the container, run the following command to start the eval:
```cmd
npm run my_eval
```

### Exit the Docker container
From inside the container:
```cmd
exit
```

### Shutdown the Docker container
From outside the container:
```cmd
docker-compose down
```