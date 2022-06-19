import { CfnOutput, Stack, StackProps } from "aws-cdk-lib"
import { Construct } from "constructs"
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as targets from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';


// Infra for the S3 -> DynamoDB and ALB (hit) -> DynamoDB report

// @todo:
// Re-organise so that we have:
// - Infra parts
// - Permissions parts
// - Connector parts
// ... would like to see how others organise these aspects.


// CDK will add guids to these names, so we can't use them directly...
const dynamodb_table_name: string = "s3_object_reporter"
const s3_bucket_name: string = "joeac-random-bucket-for-pa"

export class TsLambdaStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Creates bucket with name based on s3_bucket_name (ie appends guid)
    const s3Bucket = new s3.Bucket(this, s3_bucket_name)

    // Simple table to hold S3 object key and <other data>
    const table = new dynamodb.Table(this, 'dynamodb_table_name', {
      partitionKey: { name: 'object_key', type: dynamodb.AttributeType.STRING }
    });

    // VPC in public subnet for the ALB, but the lambdas aren't in subnets.
    // ... saves us having to use vpc endpoints for public services like S3, etc.
    const vpc = new ec2.Vpc(this, "VPC", {
      maxAzs: 2,
    })

    // Create an internet-facing Application Load Balancer using the VPC
    const lb = new elbv2.ApplicationLoadBalancer(this, "LB", {
      vpc,
      internetFacing: true,

    })

    // Add a listener on port 443 for and use the certificate for HTTPS
    const listenerHTTP = lb.addListener("HTTPListener", {
      port: 80
    })

    // Lambda to respond to requests to the ALB
    const AlbLambdaResponder = new NodejsFunction(this, 'alb-responder', {
      runtime: Runtime.NODEJS_16_X,
      entry: `${__dirname}/../lambda-fns/s3-reporter/index.ts`,
      handler: 'myFunction',
      memorySize: 128,
      architecture: Architecture.ARM_64,
      environment: {
        s3_bucket_name: s3Bucket.bucketName,
        dynamodb_table_name: table.tableName,
        NODE_OPTIONS : '--enable-source-maps'
      },
      bundling: {
        minify: true,
        sourceMap: true
        // tsconfig: `${__dirname}/../lambda-fns/s3-reporter/tsconfig.json` // if you want to override defaults
      }
    })

    // No messing around with IAM, this wraps it up for you:
    table.grantReadData(AlbLambdaResponder);

    // ALB lambda target
    const targetGroup = new targets.LambdaTarget(AlbLambdaResponder)

    // A way of getting the ALB to reject random requests targeting just
    // its IP address. A form of 'security by obscurity', but effective.
    listenerHTTP.addTargets("EnsureHasHostHeader", {
      targets: [targetGroup],
      priority: 1,
      // Explicitly state the (default) that we won't want health checks, as it
      // is a lambda
      healthCheck: {
        enabled: false,
      },
      conditions: [
        elbv2.ListenerCondition.hostHeaders([lb.loadBalancerDnsName]),
      ]

    })


    // Need a default action. By not specifying priority, it will use this:
    listenerHTTP.addAction('Fixed', {
      action: elbv2.ListenerAction.fixedResponse(200, {
        contentType: 'text/plain',
        messageBody: 'Nope!',
      })
    });


    // Lambda triggered directly by S3...
    const PutObjectLambdaFunction = new NodejsFunction(this, 'put-object-handler', {
      runtime: Runtime.NODEJS_16_X,
      entry: `${__dirname}/../lambda-fns/s3-putobject-lambda/index.ts`,
      handler: 'myFunction',
      memorySize: 128,
      architecture: Architecture.ARM_64,
      environment: {
        dynamodb_table_name: table.tableName,
        NODE_OPTIONS : '--enable-source-maps'
      },
      bundling: {
        minify: true,
        sourceMap: true
        // tsconfig: `${__dirname}/../lambda-fns/s3-reporter/tsconfig.json` // if you want to override defaults
      }
    })

    // Again, IAM permissions set by this:
    table.grantReadWriteData(PutObjectLambdaFunction);


    // Directly trigger lambda from S3, typically I'd use SNS or SQS, as it gives a few more options.
    s3Bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(PutObjectLambdaFunction)
    )

    // DNS to test the ALB that reads the dynamodb table for us
    new CfnOutput(this, 'Endpoint', {
      value: lb.loadBalancerDnsName,
      description: 'Load balancer DNS Name',
      exportName: 'albDnsName'
    })

  }
}
