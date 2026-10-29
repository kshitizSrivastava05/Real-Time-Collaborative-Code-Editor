from fastapi import FastAPI ,status
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Collaborative Editor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/",status_code=status.HTTP_200_OK)
async def home():
    return {"message": "Collaborative Editor API"}

@app.get("/health",status_code=status.HTTP_200_OK)
async def health():
    return {"status": "healthy"}

