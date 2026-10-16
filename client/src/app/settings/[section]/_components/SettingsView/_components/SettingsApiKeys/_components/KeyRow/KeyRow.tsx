"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, FormField, TextInput } from "@devdigest/ui";
import { useTestConnection } from "@/lib/hooks/settings";
import { ApiError } from "@/lib/api";
import type { ConnTestProvider } from "@/lib/types";
import { StatusBadge } from "../StatusBadge";
import { s } from "./styles";

interface KeyRowProps {
  label: string;
  provider: ConnTestProvider;
  hint: string;
  configured: boolean | undefined;
}

/** One provider key: masked input with reveal, "Test connection", and the result. */
export function KeyRow({ label, provider, hint, configured }: KeyRowProps) {
  const t = useTranslations("settings");
  const [val, setVal] = React.useState("");
  const [reveal, setReveal] = React.useState(false);
  const test = useTestConnection();
  // The latest test outcome, read straight from the mutation (no state copy).
  const res = test.isSuccess
    ? { ok: test.data.ok, message: test.data.message }
    : test.isError
      ? { ok: false, message: test.error instanceof ApiError ? test.error.message : t("apiKeys.testFailed") }
      : null;

  const run = () => test.mutate({ provider, key: val.trim() || undefined });

  return (
    <FormField label={label} hint={hint} right={<StatusBadge configured={configured} />}>
      <div style={s.keyRow}>
        <div style={s.keyInput}>
          <TextInput
            value={val}
            onChange={setVal}
            mono
            type={reveal ? "text" : "password"}
            placeholder={t("apiKeys.placeholder")}
            suffix={
              <button
                type="button"
                aria-label={reveal ? t("apiKeys.hideKey") : t("apiKeys.showKey")}
                aria-pressed={reveal}
                onClick={() => setReveal((r) => !r)}
                style={s.revealBtn}
              >
                {reveal ? <Icon.EyeOff size={14} /> : <Icon.Eye size={14} />}
              </button>
            }
          />
        </div>
        <Button kind="secondary" size="md" onClick={run} disabled={test.isPending}>
          {test.isPending ? t("apiKeys.testing") : t("apiKeys.testConnection")}
        </Button>
      </div>
      {res && (
        <div style={s.result(res.ok)}>
          {res.ok ? <Icon.CheckCircle size={13} /> : <Icon.XCircle size={13} />}
          {res.message}
        </div>
      )}
    </FormField>
  );
}
