async function tagSession(conn: snowflake.Connection, mtls: any) {
  const tag = JSON.stringify({ mtls_subject: mtls.subject, mtls_serial: mtls.serial });
  await exec(conn, 'ALTER SESSION SET QUERY_TAG = ?;', [tag]);
}
function exec(conn: snowflake.Connection, sql: string, binds?: any[]) {
  return new Promise((resolve, reject) =>
    conn.execute({ sqlText: sql, binds, complete: (e,_s,r) => e ? reject(e) : resolve(r) })
  );
}
