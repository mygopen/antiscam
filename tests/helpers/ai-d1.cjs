const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

module.exports = function createD1() {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(fs.readFileSync(path.join(__dirname, '../../migrations/0001_ai_budget.sql'), 'utf8'));
    return {
        sqlite,
        prepare(sql) {
            return {
                args: [],
                bind(...args) { this.args = args; return this; },
                async first() { return sqlite.prepare(sql).get(...this.args) || null; },
                run() { return sqlite.prepare(sql).run(...this.args); }
            };
        },
        async batch(statements) {
            sqlite.exec('BEGIN');
            try {
                const results = [];
                for (const statement of statements) results.push(statement.run());
                sqlite.exec('COMMIT');
                return results;
            } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
        }
    };
};
