# from fastapi import status , HTTPException , Request , Depends
# from utils.setting import settings
# from src.user.models import UserModel
# import jwt
# from jwt.exceptions import InvalidTokenError
# from sqlalchemy.orm import Session
# from src.utils.db import get_db


# def is_authenticated( request : Request , db : Session = Depends(get_db)):
#     try :
#         token = request.headers.get("authorization")
#         if not token:
#             raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,detail="You are unauthorised")
#         token = token.split(" ")[-1]
#         # decoding token to data
#         data = jwt.decode(token,settings.SECRET_KEY,settings.ALGORITHM)
#         user_name = data.get("username")

#         is_user = db.query(UserModel).filter(UserModel.username == user_name).first()
#         if not is_user :
#             raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,detail="You are unauthorised")
#         return is_user
    
#     except InvalidTokenError :
#         raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,detail="You are unauthorised")
