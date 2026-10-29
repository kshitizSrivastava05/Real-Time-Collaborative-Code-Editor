- Tools I Learned (TIL)in this project : 

1. *Excalidraw* - real-time collaborative UI design website with github code available
  
2. *Vite* - 

Suppose you're building a website using HTML, CSS, and JavaScript.

Without a development tool, you can open your HTML file directly in Chrome. That works for simple websites. But modern projects often use npm packages (like react , tailwind , express) , frameworks, and code that needs processing before deployment.

That's where Vite comes in.

_Definition_: Vite is a frontend development tool that provides a fast development server and builds your code into files suitable for deployment.

Think of it as having two main jobs:

  1. Development server :
  Runs your website locally while you're coding and updates it when you make changes.

  2. Build tool :
  Prepares optimized website files that you can upload to a hosting service.

# 1. Create a new Vite project named my-app
npm create vite@latest my-app

# 2. Enter the project directory
cd my-app

# 3. Install all required dependencies/packages
npm install

# 4. Start the development server
npm run dev

# 5. Create an optimized production build (when ready)
npm run build

# 6. Preview the production build locally (after building)
npm run preview