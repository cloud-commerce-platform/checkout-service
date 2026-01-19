const rabbitMQConfig = {
	host: process.env.RABBITMQ_HOST || "localhost",
	username: process.env.RABBITMQ_USERNAME || "guest",
	password: process.env.RABBITMQ_PASSWORD || "guest",
	port: 5672,
};

export const rabbitmqConfig = {
	url: `amqp://${rabbitMQConfig.username}:${rabbitMQConfig.password}@${rabbitMQConfig.host}:${rabbitMQConfig.port}`,
};
