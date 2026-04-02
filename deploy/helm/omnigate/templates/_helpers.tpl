{{/*
Expand the name of the chart.
*/}}
{{- define "omnigate.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "omnigate.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "omnigate.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "omnigate.labels" -}}
helm.sh/chart: {{ include "omnigate.chart" . }}
{{ include "omnigate.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "omnigate.selectorLabels" -}}
app.kubernetes.io/name: {{ include "omnigate.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Service account name.
*/}}
{{- define "omnigate.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "omnigate.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
PostgreSQL secret name — returns existing secret or generated one.
*/}}
{{- define "omnigate.postgresqlSecretName" -}}
{{- if .Values.postgresql.existingSecret }}
{{- .Values.postgresql.existingSecret }}
{{- else }}
{{- printf "%s-postgresql" (include "omnigate.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Redis secret name.
*/}}
{{- define "omnigate.redisSecretName" -}}
{{- if .Values.redis.existingSecret }}
{{- .Values.redis.existingSecret }}
{{- else }}
{{- printf "%s-redis" (include "omnigate.fullname" .) }}
{{- end }}
{{- end }}

{{/*
JWT secret name.
*/}}
{{- define "omnigate.jwtSecretName" -}}
{{- if .Values.jwt.existingSecret }}
{{- .Values.jwt.existingSecret }}
{{- else }}
{{- printf "%s-jwt" (include "omnigate.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Encryption secret name.
*/}}
{{- define "omnigate.encryptionSecretName" -}}
{{- if .Values.encryption.existingSecret }}
{{- .Values.encryption.existingSecret }}
{{- else }}
{{- printf "%s-encryption" (include "omnigate.fullname" .) }}
{{- end }}
{{- end }}

{{/*
GitHub secret name.
*/}}
{{- define "omnigate.githubSecretName" -}}
{{- if .Values.github.existingSecret }}
{{- .Values.github.existingSecret }}
{{- else }}
{{- printf "%s-github" (include "omnigate.fullname" .) }}
{{- end }}
{{- end }}
