// Import useEffect to run code when the component loads
// Import useState to store and update data in the component
import { useEffect, useState } from "react";
import "./App.css"
import { Editor } from "@monaco-editor/react"
function App() {
  
  const [message, setMessage] = useState("Connecting...");

   // Run this effect after the component renders
useEffect(() => {
  // Send an HTTP GET request to the FastAPI backend
  fetch("http://127.0.0.1:8000/")
    // Handle the response received from the backend
    .then((response) => {
      // Check whether the HTTP request was successful
      if (!response.ok) {
        // Throw an error if the response status is not successful
        throw new Error("Request failed");
      }
      // Convert the response body from JSON into a JavaScript object
      return response.json();
    })
    // Receive the parsed data returned by FastAPI
    .then((data) => setMessage(data.message))
    // Update the message state with the backend's "message" value

    // Handle errors, such as the backend being unavailable
    .catch(() => setMessage("Could not connect to FastAPI"));
    // Display an error message if the request fails

// Empty dependency array means this effect runs after the initial mount
}, []);

  return (
    <main className="h-screen w-full p-2 bg-black flex gap-2">

     <aside className="h-full w-1/4 bg-amber-100 border">
     <div className="heading"><h2 className="font-bold editor-h">Collaborative Editor</h2></div>
      <p className="m-4 p-2">{message}</p>
     </aside>
     <section className="h-full w-3/4  bg-neutral-800 border p-2">
     <Editor
      height="100%"
      defaultLanguage="javascript"
      defaultValue="// write you code here"
      theme="vs-dark"
     />
     </section>

    </main>
  )
}

export default App
