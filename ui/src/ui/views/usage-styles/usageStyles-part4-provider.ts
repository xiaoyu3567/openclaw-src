export const usageStylesPart4Provider = `
.provider-panel__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.provider-panel__actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.provider-switch {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  color: var(--muted);
}

.provider-form {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 8px;
}

.provider-form input,
.provider-form select {
  min-height: 34px;
}

.provider-cards-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: start;
}

.provider-card {
  margin: 0;
}

.provider-card__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.provider-card__title {
  font-size: 16px;
  font-weight: 700;
}

.provider-card__meta {
  font-size: 12px;
  color: var(--muted);
}

.provider-card__actions {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.provider-status {
  font-size: 11px;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
}

.provider-status--ok {
  color: #157347;
  background: rgba(21, 115, 71, 0.1);
}

.provider-status--error {
  color: #b42318;
  background: rgba(180, 35, 24, 0.1);
}

.provider-status--idle {
  color: var(--muted);
}

.provider-overview {
  margin-top: 10px;
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.provider-overview__label {
  font-size: 11px;
  color: var(--muted);
}

.provider-overview__value {
  font-size: 22px;
  font-weight: 700;
}

.provider-overview__value--small {
  font-size: 13px;
  font-weight: 500;
}

.provider-progress-list {
  margin-top: 8px;
  display: grid;
  gap: 8px;
}

.provider-progress-item {
  display: grid;
  gap: 4px;
  font-size: 12px;
}

.provider-progress-item progress {
  width: 100%;
  height: 8px;
}

.provider-metrics {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
}

.provider-usage-details {
  margin-top: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--secondary);
}

.provider-usage-details summary {
  cursor: pointer;
  font-weight: 600;
}

.provider-usage-grid {
  margin-top: 8px;
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.provider-usage-kv {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.provider-usage-kv strong {
  max-width: 60%;
  text-align: right;
  word-break: break-word;
}

.provider-raw {
  margin: 8px 0 0;
  max-height: 280px;
  overflow: auto;
  font-size: 11px;
}

.provider-usage-empty {
  margin-top: 8px;
  color: var(--muted);
  font-size: 12px;
}

@media (max-width: 1280px) {
  .provider-cards-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .provider-cards-grid {
    grid-template-columns: 1fr;
  }
}
`;
