/* hooks/skills.ts — React Query hooks for the Skills Lab (L02): skill CRUD,
   body versions, and the import preview. Spec: client/specs/003-skills.md. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { queryKeys } from "./query-keys";
import type {
  CreateSkillRequest,
  SkillImportDraft,
  SkillImportRequest,
  SkillListItem,
  SkillVersion,
  UpdateSkillRequest,
} from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: queryKeys.skills(),
    queryFn: () => api.get<SkillListItem[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skill(id),
    queryFn: () => api.get<SkillListItem>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skillVersions(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/** After a write to one skill: refresh the list, store the detail, drop stale versions. */
function useSkillWritten() {
  const qc = useQueryClient();
  return (skill: SkillListItem) => {
    qc.invalidateQueries({ queryKey: queryKeys.skills() });
    qc.setQueryData(queryKeys.skill(skill.id), skill);
    qc.invalidateQueries({ queryKey: queryKeys.skillVersions(skill.id) });
  };
}

export function useCreateSkill() {
  const written = useSkillWritten();
  return useMutation({
    mutationFn: (input: CreateSkillRequest) => api.post<SkillListItem>("/skills", input),
    onSuccess: written,
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: UpdateSkillRequest;
}

export function useUpdateSkill() {
  const written = useSkillWritten();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<SkillListItem>(`/skills/${id}`, patch),
    onSuccess: written,
  });
}

export function useRestoreSkillVersion() {
  const written = useSkillWritten();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<SkillListItem>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: written,
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.skills() });
      qc.removeQueries({ queryKey: queryKeys.skill(id) });
      qc.removeQueries({ queryKey: queryKeys.skillVersions(id) });
      // Deleting a skill unlinks it from every agent: their counts and links change.
      qc.invalidateQueries({ queryKey: queryKeys.agents() });
      qc.invalidateQueries({ queryKey: queryKeys.agentSkills() });
    },
  });
}

/** Parse an uploaded .md / .zip into a draft for review. The server saves nothing. */
export function useSkillImportPreview() {
  return useMutation({
    mutationFn: (input: SkillImportRequest) => api.post<SkillImportDraft>("/skills/import", input),
  });
}
