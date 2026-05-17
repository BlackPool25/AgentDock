from __future__ import annotations
from typing import Any, Callable
import structlog

log = structlog.get_logger()


class AgentScheduler:
    def __init__(self) -> None:
        self._scheduler: Any = None

    async def start(self, triggers: list[Any], task_callback: Callable[[str], Any]) -> None:
        cron_triggers = [t for t in triggers if t.type == "cron"]
        if not cron_triggers:
            return

        try:
            from apscheduler import AsyncScheduler
            from apscheduler.triggers.cron import CronTrigger

            self._scheduler = AsyncScheduler()
            await self._scheduler.start_in_background()

            for t in cron_triggers:
                await self._scheduler.add_schedule(
                    lambda: task_callback("Scheduled cron task"),
                    CronTrigger.from_crontab(t.schedule, timezone=t.timezone),
                )
                log.info("cron_registered", schedule=t.schedule)
        except Exception as e:
            log.error("scheduler_start_failed", error=str(e))

    async def stop(self) -> None:
        if self._scheduler:
            await self._scheduler.stop()
