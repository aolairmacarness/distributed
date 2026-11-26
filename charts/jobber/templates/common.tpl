{{- define "common.env" -}}
- name: PULSAR_SERVICE_URL
  value: pulsar://{{ .Release.Name }}-pulsar-broker.pulsar.svc.cluster.local:6650
{{- end -}}

{{/*
DB credentials come from the jobber-secrets Secret; DATABASE_URL is built
with Kubernetes $(VAR) expansion so the password never appears in the spec.
Usage: include "common.dbEnv" (dict "root" . "db" "auth")
The password must be URL-safe (e.g. `openssl rand -hex 24`).
*/}}
{{- define "common.secretName" -}}
{{ .Values.secrets.existingSecret | default "jobber-secrets" }}
{{- end -}}

{{- define "common.dbEnv" -}}
- name: DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ include "common.secretName" .root }}
      key: DB_PASSWORD
- name: DATABASE_URL
  value: postgresql://{{ .root.Values.postgresql.auth.username }}:$(DB_PASSWORD)@{{ .root.Release.Name }}-postgresql.postgresql.svc.cluster.local:5432/{{ .db }}
{{- end -}}

{{/* Pod-level security context. fsGroup lets the "node" user write PVCs. */}}
{{- define "common.podSecurityContext" -}}
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  runAsGroup: 1000
  fsGroup: 1000
  seccompProfile:
    type: RuntimeDefault
{{- end -}}

{{/* Container-level security context. */}}
{{- define "common.containerSecurityContext" -}}
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: ["ALL"]
{{- end -}}

{{/* Writable /tmp for containers with a read-only root filesystem. */}}
{{- define "common.tmpMount" -}}
- name: tmp
  mountPath: /tmp
{{- end -}}
{{- define "common.tmpVolume" -}}
- name: tmp
  emptyDir: {}
{{- end -}}
