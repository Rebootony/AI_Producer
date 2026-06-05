from database import SessionLocal
import models

db = SessionLocal()
threads_db = db.query(models.ChatThread).filter(models.ChatThread.project_id == "p1").all()
threads_dict = {t.id: {"id": t.id, "name": t.name, "timestamp": t.updated_at, "unreadCount": 0} for t in threads_db}

if "default" not in threads_dict:
    threads_dict["default"] = {"id": "default", "name": "主频道", "timestamp": models.get_utc_8(), "unreadCount": 0}

messages = db.query(models.Message).filter(models.Message.project_id == "p1").all()
for m in messages:
    if m.session_id not in threads_dict:
        threads_dict[m.session_id] = {"id": m.session_id, "name": f"对话 {m.session_id.replace('session_', '')}", "timestamp": m.timestamp, "unreadCount": 0}
    else:
        if m.timestamp > threads_dict[m.session_id]["timestamp"]:
            threads_dict[m.session_id]["timestamp"] = m.timestamp

sorted_threads = sorted(threads_dict.values(), key=lambda x: x["timestamp"], reverse=True)
print(sorted_threads)
