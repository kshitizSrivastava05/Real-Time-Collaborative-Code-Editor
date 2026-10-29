- We are building a real-time collaborative editor .
- Multiple clients will be coonected to the server using socket.io
- For the code editor , we are going to use manoaco editor (react) (Its the same code editor used by VS Code developed by microsoft)
- Main challenge - If two client want to make changes in same line , then how will code editor decides to perform which operation ? For this we are going to use CRDT strategory (Conflict-Free-Replicated-Datatype) ; For CRDT , we are going to use "yjs" library . "yjs" itself uses socket.io to connect clients to server 
- *CRDT* - A Conflict-free Replicated Data Type (CRDT) is a special data structure that allows multiple computers or users to update data independently and at the same time without needing a central coordinator.
- We use express to host our server

