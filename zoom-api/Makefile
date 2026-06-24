.PHONY: setup dev test

setup:
	python3 -m venv .venv
	.venv/bin/pip install --upgrade pip
	.venv/bin/pip install -r requirements.txt

dev:
	.venv/bin/python -m uvicorn app.main:app --reload

test:
	.venv/bin/pytest tests/ -v
