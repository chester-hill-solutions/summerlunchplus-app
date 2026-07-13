SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

# Auto date, override with: make all DATE=20260713
DATE ?= $(shell date +%Y%m%d)

ROOT := $(abspath ../..)
SEED_DIR := $(ROOT)/seeds/prod-data
ACTIVE_DIR := $(SEED_DIR)/active
SCRIPT_DIR := $(ROOT)/scripts/prod-data-sanitize
HELPERS_DIR := $(SCRIPT_DIR)/helpers

RAW := $(SEED_DIR)/$(DATE)-raw.sql
SAN := $(SEED_DIR)/$(DATE)-sanitized.sql
MAP := $(SEED_DIR)/$(DATE)-email-map.json
H1 := $(SEED_DIR)/$(DATE)-semester-survey-requirements-sanitized.sql
H2 := $(SEED_DIR)/$(DATE)-zz-form-submission-form-id-remap-sanitized.sql
ACTIVE_MAIN := $(ACTIVE_DIR)/$(notdir $(SAN))
ACTIVE_H1 := $(ACTIVE_DIR)/$(notdir $(H1))
ACTIVE_H2 := $(ACTIVE_DIR)/$(notdir $(H2))

EXCLUDE_TABLES := $(shell sed -e '/^[[:space:]]*\#/d' -e '/^[[:space:]]*$$/d' "$(SCRIPT_DIR)/exclude-tables.txt")
EXCLUDE_FLAGS := $(foreach t,$(EXCLUDE_TABLES),--exclude $(t))

.PHONY: help dump rewrite verify helpers activate all reset-local postcheck clean-date print

help:
	@echo "Targets:"
	@echo "  make dump [DATE=YYYYMMDD]        - dump linked remote data (raw)"
	@echo "  make rewrite [DATE=YYYYMMDD]     - rewrite emails to @chsolutions.ca"
	@echo "  make verify [DATE=YYYYMMDD]      - verify only @chsolutions.ca remains"
	@echo "  make helpers [DATE=YYYYMMDD]     - copy canonical helper SQL to dated helper files"
	@echo "  make activate [DATE=YYYYMMDD]    - stage one dated snapshot set into prod-data/active"
	@echo "  make all [DATE=YYYYMMDD]         - dump + rewrite + verify + helpers + activate"
	@echo "  make reset-local YES=1           - DESTRUCTIVE local db reset (real reset)"
	@echo "  make postcheck                   - run integrity checks after reset"
	@echo "  make clean-date [DATE=YYYYMMDD]  - remove generated files for date"
	@echo "  make print [DATE=YYYYMMDD]       - print resolved paths"

print:
	@echo DATE=$(DATE)
	@echo RAW=$(RAW)
	@echo SAN=$(SAN)
	@echo MAP=$(MAP)
	@echo H1=$(H1)
	@echo H2=$(H2)
	@echo ACTIVE_MAIN=$(ACTIVE_MAIN)
	@echo ACTIVE_H1=$(ACTIVE_H1)
	@echo ACTIVE_H2=$(ACTIVE_H2)

dump:
	@mkdir -p "$(SEED_DIR)"
	supabase db dump --linked --data-only --file "$(RAW)" $(EXCLUDE_FLAGS)

rewrite:
	python3 "$(SCRIPT_DIR)/rewrite_email_domains.py" \
		--input "$(RAW)" \
		--output "$(SAN)" \
		--domain "chsolutions.ca" \
		--map-output "$(MAP)"

verify:
	python3 "$(SCRIPT_DIR)/verify_email_domains.py" \
		--input "$(SAN)" \
		--allowed-domain "chsolutions.ca"

helpers:
	cp "$(HELPERS_DIR)/semester-survey-requirements-sanitized.sql" "$(H1)"
	cp "$(HELPERS_DIR)/zz-form-submission-form-id-remap-sanitized.sql" "$(H2)"

activate:
	@mkdir -p "$(ACTIVE_DIR)"
	rm -f "$(ACTIVE_DIR)"/*-sanitized.sql
	cp "$(SAN)" "$(ACTIVE_MAIN)"
	cp "$(H1)" "$(ACTIVE_H1)"
	cp "$(H2)" "$(ACTIVE_H2)"

all: dump rewrite verify helpers activate

# This is a real reset, not a dry run.
reset-local:
	@if [ "$${YES:-0}" != "1" ]; then \
		echo "Refusing to run. This is DESTRUCTIVE to local Supabase DB."; \
		echo "Re-run with: make reset-local YES=1"; \
		exit 1; \
	fi
	supabase db reset

postcheck:
	@echo "Running postcheck SQL against local DB..."
	supabase db query --file "$(SCRIPT_DIR)/postcheck.sql"

clean-date:
	rm -f "$(RAW)" "$(SAN)" "$(MAP)" "$(H1)" "$(H2)" "$(ACTIVE_MAIN)" "$(ACTIVE_H1)" "$(ACTIVE_H2)"
