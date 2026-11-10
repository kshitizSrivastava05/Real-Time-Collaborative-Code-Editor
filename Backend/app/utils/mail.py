# from fastapi import FastAPI
# from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
# from pydantic import EmailStr, BaseModel
# from typing import List


# conf = ConnectionConfig(
#     MAIL_USERNAME = "srivastava.kshitiz05@gmail.com",
#     MAIL_PASSWORD = "zlop fhny rosv berf", #app password
#     MAIL_FROM = "srivastava.kshitiz05@gmail.com",
#     MAIL_PORT = 587,
#     MAIL_SERVER = "smtp.gmail.com",
#     MAIL_FROM_NAME="Kshitiz Srivastava",
#     MAIL_STARTTLS = True,
#     MAIL_SSL_TLS = False,
#     USE_CREDENTIALS = True,
#     VALIDATE_CERTS = True
# )    


# async def send_email(emails: List[str]):
#     html = """<p>Hi, Thanks for Registration on my ToDo app . Hope you have good experience with us.</p> """

#     message = MessageSchema(
#         subject="Registration Confirmation",
#         recipients=emails,
#         body=html,
#         subtype=MessageType.html)

#     fm = FastMail(conf)
#     await fm.send_message(message)
#     print("mail has been sent successfully")