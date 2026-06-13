interface TaskListItemHtmlOptions {
  checked?: boolean;
  bodyHtml?: string;
  text?: string;
  placeholder?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function taskListItemHtml({
  checked = false,
  bodyHtml,
  text,
  placeholder,
}: TaskListItemHtmlOptions = {}): string {
  const body = bodyHtml ?? (text ? escapeHtml(text) : '<br>');
  const placeholderAttrs = placeholder
    ? ` data-placeholder="${escapeHtml(placeholder)}" data-placeholder-visible="${body === '<br>' ? 'true' : 'false'}"`
    : '';

  return '<div class="doc-task-item" data-task-list-item="true">' +
    `<input type="checkbox" data-task-checkbox="true" contenteditable="false"${checked ? ' checked' : ''}>` +
    `<div class="doc-task-text"${placeholderAttrs}>${body}</div>` +
  '</div>';
}
