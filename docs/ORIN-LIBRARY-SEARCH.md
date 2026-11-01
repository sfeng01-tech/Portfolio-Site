# ORIN library search and recommendations

The authenticated “Search your whole library” control searches all active
`orin_items`, rather than only the current digest or reading-list view. Search
is submitted explicitly and returns at most 100 items; a result can be added to
the research queue. The existing digest and reading-list filter also has an
explicit “Find related” button, scoped to the current view. Both can send the
query to the embedding provider. They combine keyword matches and current item embeddings by
reciprocal rank fusion. A semantic distance cutoff limits unrelated additions;
this is a relevance heuristic, not a correctness guarantee. If embeddings, the
provider, or `OPENROUTER_API_KEY` are unavailable, it falls back to keyword
search. Stale embeddings are never used. Deleted items are excluded. The query
is sent through OpenRouter to the selected embedding provider; each submitted
search can incur a small provider charge. The API validates input, requires the
ORIN owner and same-origin POST, and returns `private, no-store` responses.

Research suggestions may add existing indexed items related to the interests
and goals in the research profile. A profile-based query is cached for ten
minutes per server instance (only item IDs are cached and current item data is
reloaded each time). This can incur an embedding charge when the cache expires;
the profile text is sent to the embedding provider. If no provider key or
index is available, existing heuristic suggestions remain available. Topic
rules, AMD-required filtering, dismissed sources and untrusted-text handling
remain in force; a similarity is not proof of a research gap or AMD support.

The digest’s “Worth your time” ranking uses a small, capped boost for similarity
to up to 20 sources explicitly marked “More like this.” It does not infer a
preference from reading or saving an item. With no positive feedback or no
current vectors, the existing ranking is unchanged. The signal is not used to
override source diversity, and disliked items are not used as positive anchors.

`OPENROUTER_API_KEY` must be configured on the Node web service for semantic
queries. The browser never receives it. The daily indexer maintains item
vectors; indexing can lag collection and only the first 3,000 characters of an
excerpt are embedded. Existing keyword retrieval covers unindexed items. Notes
and full documents stored outside `orin_items` are not part of this search.
