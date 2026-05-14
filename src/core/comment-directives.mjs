function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripTrailingWhitespace(line) {
  return line.replace(/[ \t]+$/u, '');
}

export function isCommentOnlyLine(line, commentPrefix) {
  if (!commentPrefix) return false;
  const pattern = new RegExp(`^\\s*${escapeRegExp(commentPrefix)}`);
  return pattern.test(line);
}

export function isActualCodeLine(line, commentPrefix) {
  const trimmed = line.trim();
  return trimmed.length > 0 && !isCommentOnlyLine(line, commentPrefix);
}

export function extractTrailingCommentDirective(line, commentPrefix, marker) {
  if (!commentPrefix) return null;

  const markerIndex = line.indexOf(marker);
  if (markerIndex === -1) return null;

  const commentStart = line.lastIndexOf(commentPrefix, markerIndex);
  if (commentStart === -1) return null;

  const directiveEnd = line.lastIndexOf(']');
  if (directiveEnd === -1 || directiveEnd < markerIndex) {
    return {
      beforeComment: line.slice(0, commentStart),
      comment: line.slice(commentStart),
      renderedLine: stripTrailingWhitespace(line.slice(0, markerIndex)),
      isCommentOnly: line.slice(0, commentStart).trim().length === 0,
      hasVisibleCommentText: line.slice(commentStart + commentPrefix.length, markerIndex).trim().length > 0,
      hasTrailingContent: false,
    };
  }

  const beforeComment = line.slice(0, commentStart);
  const commentText = line.slice(commentStart + commentPrefix.length, markerIndex);
  const trailingContent = line.slice(directiveEnd + 1);
  const trimmedCommentText = stripTrailingWhitespace(commentText);
  const hasVisibleCommentText = trimmedCommentText.trim().length > 0;

  let renderedLine = null;

  if (hasVisibleCommentText) {
    renderedLine = `${beforeComment}${commentPrefix}${trimmedCommentText}`;
  } else if (beforeComment.trim().length > 0) {
    renderedLine = stripTrailingWhitespace(beforeComment);
  }

  return {
    beforeComment,
    comment: line.slice(commentStart, directiveEnd + 1),
    renderedLine,
    isCommentOnly: beforeComment.trim().length === 0,
    hasVisibleCommentText,
    hasTrailingContent: trailingContent.trim().length > 0,
  };
}
