import * as AWS from "aws-sdk";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'

// Lambda that reports the Puts to the S3 bucket, indirectly, via a DynamoDB table

const dynamodb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
const db_table_name: string = process.env.dynamodb_table_name as unknown as string

function get_html( title: string , body_html :string ) : string {
   return  `<!DOCTYPE html>
    <html>
        <head>
        </head>
        <body><h1>` + title + `</h1>` + 
        body_html +
        `</body>
    </html>`
}


export async function myFunction(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {

    const scan_obj = {
        TableName: db_table_name
    }

    // Query db table:
    const db_items = await dynamodb.scan( scan_obj ).promise()
 
    let response_list:string[] = []

    for ( const item of db_items.Items! ){
        console.log( JSON.stringify( item ))

        response_list.push( "File: " + item.object_key.S + ", size is " + item.object_size.S + " bytes.")
    }
    
    const html_text = get_html( 
        'File list for S3 bucket ' + process.env.s3_bucket_name,
        response_list.join( "</br>")
        )

    console.log( db_items  )

    // Always all good, for now: 
    return {
        statusCode: 200,
        body: html_text,
        headers: {
            'Content-Type': 'text/html',
        }
    }
}