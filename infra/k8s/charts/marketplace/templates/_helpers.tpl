{{- define "marketplace.name" -}}
marketplace
{{- end -}}

{{- define "marketplace.labels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/part-of: marketplace
{{- end -}}
