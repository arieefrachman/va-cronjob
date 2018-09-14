const express = require('express');
const app = express();
const cron = require('node-cron');
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf} = format;
const customFormat = printf( info => {
    return `${info.timestamp} ${info.level}: ${info.message}`;
});
const logger = createLogger({
    level: 'info',
    format: combine( format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss'}), timestamp(), customFormat),
    transports: [
        new transports.File({ filename: 'info.log'})
    ]
});
const pgp = require('pg-promise')();
const db = pgp('postgres://postgres:m4unGbdGs4mpsql@156.67.214.233:5434/va_basys');
const exec = require('execution-time')();
const uuid = require('uuid/v1');
const moment = require('moment');


cron.schedule("* * * * *", async () => {
    try{
        exec.start();
        let account = await db.any('select va_acc_no, sr.company_id, sr.va_giro_acc_no, tx.last_os from master_tx tx join ref_split_rule sr on(tx.company_id = sr.company_id) where is_settlement = 0 and sr.act_type=0');
        let now = moment(new Date()).format('YYYY-MM-DD HH:mm:ss');
        if(account.length == 0){
            logger.info('Nothing to do..');
        }else{
            for(let item of account){
                let current_os_giro = await db.any('select last_os from master_tx where va_acc_no = $1 and created_at  = (select max(created_at) from master_tx where va_acc_no = $1)',[item.va_giro_acc_no]);
                let current_os_va = await db.any('select last_os from master_tx where va_acc_no = $1 and is_settlement=0 and created_at  = (select max(created_at) from master_tx where va_acc_no = $1)',[item.va_acc_no]);

                let db_ = current_os_va.length == 0 ? 0 - item.last_os : parseInt(current_os_va[0].last_os) - parseInt(item.last_os);
                let cr_ = current_os_giro.length == 0 ? 0 + item.last_os : parseInt(current_os_giro[0].last_os) + parseInt(item.last_os);
                let archive_no = uuid();

                db.tx(t => {
                    t.none('INSERT INTO master_tx (company_id,va_acc_no,tx_type,tx_code, current_os, tx_amount, last_os, created_at, tx_desc, archive_no, channel_id) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',[item.company_id, item.va_giro_acc_no,1,40, (current_os_giro.length == 0 ? 0 : current_os_giro[0].last_os) , item.last_os, cr_, now, 'Overpaid Settlement '+item.va_giro_acc_no, archive_no, 4]);
                    t.none('INSERT INTO master_tx (company_id,va_acc_no,tx_type,tx_code, current_os, tx_amount, last_os, created_at, tx_desc, archive_no, channel_id) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',[item.company_id, item.va_acc_no,0,40, (current_os_va.length == 0 ? 0 : current_os_va[0].last_os) , item.last_os, db_, now, 'Overpaid Settlement '+item.va_acc_no, archive_no, 4]);
                    t.none('UPDATE master_tx set is_settlement = 1 where va_acc_no = $1 and is_settlement = 0', [item.va_acc_no]);
                }).then(d => {
                    console.log('Success!');
                }).catch(e => {
                    console.log('Error '+e);
                });
            }

            logger.info('Settlement completed in '+exec.stop().time+' ms');
    }
    }catch(e){
        logger.error('Whopss something went wrong! '+e);
    }
});

cron.schedule("* * * * *", () => {
    
});

app.listen(6745, () => {
    logger.info('starting on port 6745');
})