import * as AWS from "aws-sdk";
import {  APIGatewayProxyResultV2, S3Event } from 'aws-lambda'

// This lambda is invoked by S3 event trigger from S3 PutObject
// It records into a DynamoDB table the S3 key and its size.

const dynamodb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
const db_table_name: string = process.env.dynamodb_table_name?.toString() as unknown as string

// @todo get sns topic notification event, etc.
export async function myFunction(event: S3Event): Promise<APIGatewayProxyResultV2> {

    console.log( JSON.stringify( event ))

    // We assume 1 event per PutObject... (Which is the case for SNS topic connected to S3 , more research needed!)
    const obj_key = event.Records[0].s3.object.key
    const obj_size = event.Records[0].s3.object.size

    const item_obj:AWS.DynamoDB.PutItemInput = {
        TableName: db_table_name,
        Item: {
            'object_key' : { S : obj_key},
            'object_size' : { S : obj_size.toString() }
        }
    }

    try
    {
        var result = await dynamodb.putItem(item_obj).promise();
        console.log ( JSON.stringify ( result )) // empty is good
    }
    catch(err)
    {
        console.log(err);
    }

    // For now, assume all is okay...
    return {
        statusCode: 200,
        body: JSON.stringify(event),
    };
}