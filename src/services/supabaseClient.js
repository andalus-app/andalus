import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://yqtnwgezqbznbpeooott.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxdG53Z2V6cWJ6bmJwZW9vb3R0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTkyNzIsImV4cCI6MjA4ODk3NTI3Mn0.ELMMwwFKuT7JnXDU0NiQDYFXs8eZWSjThZH1bNJAw6Y';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
