/*
 * PublicSupabase Lite
 * A tiny browser client for this portal. It talks directly to Supabase REST
 * and Storage, so the website does not depend on the external supabase-js CDN.
 */
(function (global) {
  'use strict';

  function cleanBaseUrl(value) {
    return String(value || '').replace(/\/+$/, '');
  }

  function encodeObjectPath(path) {
    return String(path || '')
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
  }

  function makeError(payload, fallback) {
    if (payload && typeof payload === 'object') {
      return {
        message: payload.message || payload.msg || payload.error_description || payload.error || fallback,
        details: payload.details || null,
        hint: payload.hint || null,
        code: payload.code || null
      };
    }
    return { message: String(payload || fallback), details: null, hint: null, code: null };
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch (_) { return text; }
  }

  class QueryBuilder {
    constructor(baseUrl, key, table) {
      this.baseUrl = baseUrl;
      this.key = key;
      this.table = table;
      this.method = 'GET';
      this.body = undefined;
      this.params = new URLSearchParams();
      this.prefer = [];
      this.singleMode = null;
      this.hasSelect = false;
    }

    select(columns = '*') {
      this.hasSelect = true;
      this.params.set('select', columns);
      return this;
    }

    insert(values) {
      this.method = 'POST';
      this.body = values;
      return this;
    }

    update(values) {
      this.method = 'PATCH';
      this.body = values;
      return this;
    }

    upsert(values, options = {}) {
      this.method = 'POST';
      this.body = values;
      this.prefer.push('resolution=merge-duplicates');
      if (options.onConflict) this.params.set('on_conflict', options.onConflict);
      return this;
    }

    delete() {
      this.method = 'DELETE';
      return this;
    }

    eq(column, value) { return this.filter(column, 'eq', value); }
    gte(column, value) { return this.filter(column, 'gte', value); }
    lte(column, value) { return this.filter(column, 'lte', value); }
    lt(column, value) { return this.filter(column, 'lt', value); }

    filter(column, operator, value) {
      const rendered = value === null ? 'null' : String(value);
      this.params.append(column, `${operator}.${rendered}`);
      return this;
    }

    in(column, values) {
      const rendered = (values || []).map(value => String(value).replace(/,/g, '\\,')).join(',');
      this.params.append(column, `in.(${rendered})`);
      return this;
    }

    order(column, options = {}) {
      this.params.append('order', `${column}.${options.ascending === false ? 'desc' : 'asc'}`);
      return this;
    }

    limit(value) {
      this.params.set('limit', String(value));
      return this;
    }

    maybeSingle() {
      this.singleMode = 'maybe';
      return this;
    }

    single() {
      this.singleMode = 'single';
      return this;
    }

    then(onFulfilled, onRejected) {
      return this.execute().then(onFulfilled, onRejected);
    }

    async execute() {
      const headers = {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        Accept: 'application/json'
      };

      if (this.method !== 'GET' && this.method !== 'HEAD') {
        headers['Content-Type'] = 'application/json';
        if (this.hasSelect || this.singleMode) this.prefer.push('return=representation');
        else this.prefer.push('return=minimal');
      }
      if (this.prefer.length) headers.Prefer = Array.from(new Set(this.prefer)).join(',');

      const query = this.params.toString();
      const endpoint = `${this.baseUrl}/rest/v1/${encodeURIComponent(this.table)}${query ? `?${query}` : ''}`;

      try {
        const response = await fetch(endpoint, {
          method: this.method,
          headers,
          body: this.body === undefined ? undefined : JSON.stringify(this.body)
        });
        const payload = await parseResponse(response);
        if (!response.ok) {
          return { data: null, error: makeError(payload, `Request failed (${response.status})`) };
        }

        let data = payload;
        if (this.singleMode) {
          if (Array.isArray(payload)) {
            if (payload.length === 0) {
              if (this.singleMode === 'maybe') return { data: null, error: null };
              return { data: null, error: makeError(null, 'No row was returned.') };
            }
            if (payload.length > 1 && this.singleMode === 'single') {
              return { data: null, error: makeError(null, 'More than one row was returned.') };
            }
            data = payload[0];
          }
        }
        return { data, error: null };
      } catch (error) {
        return { data: null, error: makeError(error, 'Network request failed.') };
      }
    }
  }

  class StorageBucket {
    constructor(baseUrl, key, bucket) {
      this.baseUrl = baseUrl;
      this.key = key;
      this.bucket = bucket;
    }

    async upload(path, file, options = {}) {
      const endpoint = `${this.baseUrl}/storage/v1/object/${encodeURIComponent(this.bucket)}/${encodeObjectPath(path)}`;
      const headers = {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        'x-upsert': options.upsert ? 'true' : 'false',
        'Content-Type': options.contentType || file.type || 'application/octet-stream'
      };
      if (options.cacheControl) headers['Cache-Control'] = `max-age=${options.cacheControl}`;

      try {
        const response = await fetch(endpoint, { method: 'POST', headers, body: file });
        const payload = await parseResponse(response);
        if (!response.ok) return { data: null, error: makeError(payload, `Upload failed (${response.status})`) };
        return { data: payload || { path }, error: null };
      } catch (error) {
        return { data: null, error: makeError(error, 'Upload network request failed.') };
      }
    }

    getPublicUrl(path) {
      return {
        data: {
          publicUrl: `${this.baseUrl}/storage/v1/object/public/${encodeURIComponent(this.bucket)}/${encodeObjectPath(path)}`
        }
      };
    }

    async remove(paths) {
      const failures = [];
      for (const path of paths || []) {
        const endpoint = `${this.baseUrl}/storage/v1/object/${encodeURIComponent(this.bucket)}/${encodeObjectPath(path)}`;
        try {
          const response = await fetch(endpoint, {
            method: 'DELETE',
            headers: { apikey: this.key, Authorization: `Bearer ${this.key}` }
          });
          if (!response.ok && response.status !== 404) {
            failures.push(await parseResponse(response));
          }
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length) return { data: null, error: makeError(failures[0], 'One or more files could not be removed.') };
      return { data: paths || [], error: null };
    }
  }

  function createClient(url, key) {
    const baseUrl = cleanBaseUrl(url);
    return {
      from(table) { return new QueryBuilder(baseUrl, key, table); },
      storage: {
        from(bucket) { return new StorageBucket(baseUrl, key, bucket); }
      }
    };
  }

  global.PublicSupabase = { createClient };
})(window);
