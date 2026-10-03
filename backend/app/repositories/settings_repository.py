from sqlalchemy.orm import Session

from app.models.job import AppSetting


class SettingsRepository:
    def __init__(self, session: Session):
        self.session = session

    def get(self, key: str, default: str = "") -> str:
        row = self.session.get(AppSetting, key)
        return row.value if row else default

    def set(self, key: str, value: str) -> None:
        row = self.session.get(AppSetting, key)
        if row:
            row.value = value
        else:
            self.session.add(AppSetting(key=key, value=value))
        self.session.commit()
