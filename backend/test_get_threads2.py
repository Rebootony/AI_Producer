from database import SessionLocal
import models
db = SessionLocal()
threads_db = db.query(models.ChatThread).filter(models.ChatThread.project_id == "p1").all()
for t in threads_db:
    print("t.updated_at:", repr(t.updated_at))
messages = db.query(models.Message).filter(models.Message.project_id == "p1").all()
for m in messages[:1]:
    print("m.timestamp:", repr(m.timestamp))
