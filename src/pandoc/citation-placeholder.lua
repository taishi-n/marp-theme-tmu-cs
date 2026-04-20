function Cite(el)
  local keys = {}

  for _, citation in ipairs(el.citations) do
    table.insert(keys, citation.id)
  end

  return pandoc.Span(
    { pandoc.Cite(el.content, el.citations) },
    pandoc.Attr("", { "citation-placeholder" }, {
      ["data-cite-keys"] = table.concat(keys, ";"),
    })
  )
end
