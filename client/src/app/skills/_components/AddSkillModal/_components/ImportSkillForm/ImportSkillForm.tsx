/* ImportSkillForm — the "From file" tab. Choose a .md or .zip → the server
   parses it (POST /skills/import, nothing saved) → review the editable draft,
   its rendered body, warnings and the archive files that were ignored → save
   it disabled. Saving is the only step that writes. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Markdown } from "@devdigest/ui";
import type { SkillImportDraft, SkillListItem } from "@devdigest/shared";
import { useCreateSkill, useSkillImportPreview } from "@/lib/hooks/skills";
import { SkillFields } from "../../../SkillFields";
import {
  isNameTakenError,
  isSkillFormComplete,
  toSkillForm,
  toSkillPayload,
  type SkillForm,
} from "../../../SkillFields/helpers";
import { s as modal } from "../../styles";
import { IMPORT_ACCEPT, MAX_IMPORT_BYTES } from "./constants";
import { fileToBase64 } from "./helpers";
import { s } from "./styles";

export interface ImportSkillFormProps {
  onCreated: (skill: SkillListItem) => void;
}

export function ImportSkillForm({ onCreated }: ImportSkillFormProps) {
  const t = useTranslations("skills");
  const preview = useSkillImportPreview();
  const create = useCreateSkill();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<SkillImportDraft | null>(null);
  const [form, setForm] = React.useState<SkillForm | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setDraft(null);
    setForm(null);
    setFileName(file.name);
    if (file.size > MAX_IMPORT_BYTES) {
      setLocalError(t("import.tooLarge"));
      return;
    }
    setLocalError(null);
    const content_base64 = await fileToBase64(file);
    preview.mutate(
      { filename: file.name, content_base64 },
      {
        onSuccess: (d) => {
          setDraft(d);
          setForm(toSkillForm(d));
        },
      },
    );
  };

  const chooseAnother = () => {
    setDraft(null);
    setForm(null);
    setFileName(null);
    preview.reset();
    create.reset();
    if (inputRef.current) inputRef.current.value = "";
  };

  const submit = () => {
    if (!form) return;
    create.mutate({ ...toSkillPayload(form), source: "imported_file" }, { onSuccess: onCreated });
  };

  const error = localError ?? (preview.error ? t("import.failed", { message: preview.error.message }) : null);

  return (
    <div style={modal.body}>
      <input
        ref={inputRef}
        type="file"
        accept={IMPORT_ACCEPT}
        style={s.hiddenInput}
        data-testid="skill-import-input"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      {!draft || !form ? (
        <>
          <button type="button" style={s.drop} onClick={() => inputRef.current?.click()}>
            <Icon.Upload size={22} />
            <span style={s.dropTitle}>{preview.isPending ? t("import.reading") : fileName ?? t("import.choose")}</span>
            <span style={s.hint}>{t("import.hint")}</span>
          </button>
          {error && (
            <div role="alert" style={s.error}>
              {error}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={s.trust} role="note">
            <Icon.AlertTriangle size={16} style={s.trustIcon} />
            <div>
              <div style={s.trustTitle}>{t("import.trustTitle")}</div>
              {t("import.trustBody")}
            </div>
          </div>

          <div style={s.fileRow}>
            <Icon.FileText size={14} />
            <span className="mono" style={s.fileName}>
              {fileName}
            </span>
            <Button kind="ghost" size="sm" onClick={chooseAnother}>
              {t("import.chooseAnother")}
            </Button>
          </div>

          {draft.warnings.length > 0 && (
            <>
              <div style={s.listTitle}>{t("import.warnings")}</div>
              <ul style={s.list}>
                {draft.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </>
          )}

          {draft.ignored_files.length > 0 && (
            <details style={s.details}>
              <summary style={s.summary}>{t("import.ignored", { count: draft.ignored_files.length })}</summary>
              <ul style={s.list}>
                {draft.ignored_files.map((f) => (
                  <li key={f} className="mono">
                    {f}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div style={s.previewLabel}>{t("import.preview")}</div>
          <div style={s.preview} data-testid="skill-import-preview">
            <Markdown>{form.body}</Markdown>
          </div>

          <SkillFields
            form={form}
            onChange={setForm}
            bodyRows={8}
            nameError={isNameTakenError(create.error) ? t("form.nameTaken") : undefined}
          />
          <div style={modal.submitRow}>
            <Button
              kind="primary"
              full
              onClick={submit}
              disabled={!isSkillFormComplete(form) || create.isPending}
              loading={create.isPending}
            >
              {create.isPending ? t("import.importing") : t("import.submit")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
