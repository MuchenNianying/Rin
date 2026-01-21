import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import path from "path";
import Container, { Service } from "typedi";
import type { DB } from "../_worker";
import type { Env } from "../db/db";
import { getDB, getEnv } from "./di";
import { createS3Client } from "./s3";

// Cache Utils for storing data in memory and persisting to S3
// DO NOT USE THIS TO STORE SENSITIVE DATA

@Service()
export class CacheImpl {
    cache: Map<string, any> = new Map<string, any>();
    db: DB;
    env: Env;
    cacheUrl: string | null;
    type: string;
    loaded: boolean = false;
    s3: S3Client | null;

    constructor(type: string = "cache") {
        this.type = type;
        this.db = getDB();
        this.env = getEnv();
        this.cache = new Map<string, any>();
        this.s3 = null;
        this.cacheUrl = null;
        
        try {
            if (this.env.S3_ACCESS_HOST) {
                const slash = this.env.S3_ACCESS_HOST.endsWith('/') ? '' : '/';
                this.cacheUrl = this.env.S3_ACCESS_HOST + slash + path.join(this.env.S3_CACHE_FOLDER || 'cache', `${type}.json`);
            }
            
            if (this.env.S3_ACCESS_KEY_ID && this.env.S3_SECRET_ACCESS_KEY) {
                this.s3 = createS3Client();
            }
        } catch (e) {
            console.error('Cache initialization error:', e.message);
        }
    }

    async load() {
        console.log('Cache load', this.cacheUrl);
        try {
            if (!this.cacheUrl) {
                console.log('Cache URL not configured, skipping load');
                this.loaded = true;
                return;
            }
            
            const response = await fetch(new Request(this.cacheUrl))
            if (response.ok) {
                const data = await response.json<any>()
                for (let key in data) {
                    this.cache.set(key, data[key]);
                }
            }
            this.loaded = true;
        } catch (e: any) {
            console.error('Cache load failed');
            console.error(e.message);
            this.loaded = true;
        }
    }
    async all() {
        if (!this.loaded) {
            await this.load();
        }
        return this.cache;
    }
    async get(key: string) {
        if (!this.loaded) {
            await this.load();
        }
        return this.cache.get(key);
    }
    async getByPrefix(prefix: string): Promise<any[]> {
        if (!this.loaded) {
            await this.load();
        }
        const result = [];
        for (let key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                result.push(this.cache.get(key));
            }
        }
        return result;
    }
    async getBySuffix(suffix: string): Promise<any[]> {
        if (!this.loaded) {
            await this.load();
        }
        const result = [];
        for (let key of this.cache.keys()) {
            if (key.endsWith(suffix)) {
                result.push(this.cache.get(key));
            }
        }
        return result;
    }
    async getOrSet<T>(key: string, value: () => Promise<T>) {
        const cached = await this.get(key)
        if (cached !== undefined) {
            console.log('Cache hit', key);
            return cached as T;
        }
        console.log('Cache miss', key);
        const newValue = await value();
        await this.set(key, newValue);
        return newValue;
    }

    async getOrDefault<T>(key: string, defaultValue: T) {
        return this.getOrSet(key, async () => defaultValue);
    }
    

    async set(key: string, value: any, save: boolean = true) {
        if (!this.loaded)
            await this.load();
        this.cache.set(key, value);
        if (save) {
            await this.save();
        }
    }

    async delete(key: string, save: boolean = true) {
        if (!this.loaded)
            await this.load();
        this.cache.delete(key);
        if (save) {
            await this.save();
        }
    }

    async deletePrefix(prefix: string) {
        for (let key of this.cache.keys()) {
            console.log('Cache key', key);
            if (key.startsWith(prefix)) {
                console.log('Cache delete', key);
                await this.delete(key, false);
            }
        }
        await this.save();
    }
    async deleteSuffix(suffix: string) {
        for (let key of this.cache.keys()) {
            console.log("Cache key", key);
            if (key.endsWith(suffix)) {
                console.log("Cache delete", key);
                await this.delete(key, false);
            }
        }
        await this.save();
    }
    async clear() {
        this.cache.clear();
        await this.save();
    }

    async save() {
        try {
            if (!this.s3 || !this.env.S3_BUCKET) {
                console.log('S3 not configured, skipping cache save');
                return;
            }
            
            const cacheKey = path.join(this.env.S3_CACHE_FOLDER || 'cache', `${this.type}.json`);
            await this.s3.send(new PutObjectCommand({
                Bucket: this.env.S3_BUCKET,
                Key: cacheKey,
                Body: JSON.stringify(Object.fromEntries(this.cache))
            })).then(() => {
                console.log('Cache saved');
            }).catch((e: any) => {
                console.error('Cache save failed')
                console.error(e.message);
            });
        } catch (e: any) {
            console.error('Cache save error:', e.message);
        }
    }
}

export const PublicCache = () => Container.get<CacheImpl>("cache");
export const ServerConfig = () => Container.get<CacheImpl>("server.config");
export const ClientConfig = () => Container.get<CacheImpl>("client.config");