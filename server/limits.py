from flask import current_app, request
from flask_limiter import Limiter

from flask_limiter.util import get_remote_address


def install_key() -> str:
    install_id = request.headers.get("X-Install-Id", "")
    return f"install:{install_id}" if install_id else get_remote_address()


def install_hour_limit() -> str:
    return current_app.config["RATE_PER_INSTALL_HOURLY"]


def install_day_limit() -> str:
    return current_app.config["RATE_PER_INSTALL_DAILY"]


def ip_hour_limit() -> str:
    return current_app.config["RATE_PER_IP"]


limiter = Limiter(key_func=get_remote_address, default_limits=[])
