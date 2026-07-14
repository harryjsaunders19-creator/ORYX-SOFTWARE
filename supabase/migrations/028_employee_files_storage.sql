-- Private bucket for employee photos/documents (service-role only; no public policies).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-files',
  'employee-files',
  false,
  15728640,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
